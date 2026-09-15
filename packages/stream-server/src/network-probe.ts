import { randomUUID } from "node:crypto";
import {
  bridgeNetworkProbeResponseV1Schema,
  type BridgeNetworkProbeFailureCode,
  type BridgeNetworkProbePhase,
  type BridgeNetworkProbeResponseV1,
} from "@streamer/shared";
import { getClient, normalizeTorrentMagnetForRuntime } from "./torrent.js";
import { waitForReady } from "./torrent-helpers.js";
import { torrentFailureReason } from "./torrent-failure.js";
import { addStreamServerBreadcrumb } from "./sentry.js";

const TOTAL_TIMEOUT_MS = 15_000;
const INITIAL_PEER_TIMEOUT_MS = 5_000;
const METADATA_TIMEOUT_AFTER_PEER_MS = 7_000;
const RESULT_TTL_MS = 10 * 60_000;

type ProbeResult = BridgeNetworkProbeResponseV1;

interface CachedResult {
  result: ProbeResult;
  expiresAt: number;
  failureSignature?: string;
  failureCount: number;
}

interface InFlightProbe {
  promise: Promise<ProbeResult>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
}

let inFlight: InFlightProbe | null = null;
let cached: CachedResult | null = null;

function probeMagnet() {
  const configured = process.env.STREAMER_TORRENT_NETWORK_PROBE_MAGNET?.trim();
  if (!configured || !configured.startsWith("magnet:?")) return null;

  try {
    const parsed = new URL(configured);
    const infoHash = parsed.searchParams
      .getAll("xt")
      .map((value) => value.replace(/^urn:btih:/i, "").trim())
      .find((value) => /^(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(value));
    if (!infoHash) return null;
    return normalizeTorrentMagnetForRuntime(configured);
  } catch {
    return null;
  }
}

export function isTorrentNetworkProbeConfigured() {
  return Boolean(probeMagnet());
}

function safeLog(
  probeId: string,
  phase: BridgeNetworkProbePhase,
  data: {
    status?: ProbeResult["status"];
    peerCount?: number;
    failureCode?: BridgeNetworkProbeFailureCode;
    elapsedMs: number;
  },
) {
  const payload = { probeId, phase, ...data };
  addStreamServerBreadcrumb({
    category: "gateway",
    message: `torrent_network_probe.${phase}`,
    level: data.failureCode ? "warning" : "debug",
    data: payload,
  });
}

function abortError() {
  const error = new Error("Torrent network probe cancelled.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown) {
  return (
    (error as { name?: string } | undefined)?.name === "AbortError" ||
    (error as { code?: string } | undefined)?.code === "ABORT_ERR"
  );
}

async function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function destroyTorrent(torrent: any) {
  if (!torrent || torrent.destroyed || typeof torrent.destroy !== "function") {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    try {
      torrent.destroy(() => resolve());
    } catch {
      resolve();
    }
  });
}

function failureResult(
  probeId: string,
  startedAt: number,
  phase: BridgeNetworkProbePhase,
  failureCode: BridgeNetworkProbeFailureCode,
  peerCount?: number,
): ProbeResult {
  return bridgeNetworkProbeResponseV1Schema.parse({
    protocolVersion: 1,
    probeId,
    status: "degraded",
    phase,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    ...(peerCount !== undefined ? { peerCount } : {}),
    failureCode,
  });
}

function failureSignature(result: ProbeResult) {
  return `${result.phase}:${result.failureCode ?? "unknown"}`;
}

function applyFailureStreak(result: ProbeResult): ProbeResult {
  if (result.status === "passed" || result.status === "unknown") {
    cached = {
      result,
      expiresAt: Date.now() + RESULT_TTL_MS,
      failureCount: 0,
    };
    return result;
  }

  const signature = failureSignature(result);
  const previousCount =
    cached?.failureSignature === signature ? cached.failureCount : 0;
  const failureCount = previousCount + 1;
  const finalResult =
    failureCount >= 2 ? { ...result, status: "blocked" as const } : result;
  cached = {
    result: finalResult,
    expiresAt: Date.now() + RESULT_TTL_MS,
    failureSignature: signature,
    failureCount,
  };
  return finalResult;
}

async function readFirstByte(
  file: any,
  signal: AbortSignal,
  timeoutMs: number,
) {
  if (timeoutMs <= 0) throw new Error("first-byte-timeout");

  const stream = file?.createReadStream?.({ start: 0, end: 64 * 1024 - 1 });
  if (!stream) throw new Error("first-byte-timeout");

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(
      () => finish(new Error("first-byte-timeout")),
      timeoutMs,
    );
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      stream.removeListener?.("data", onData);
      stream.removeListener?.("error", onError);
      stream.removeListener?.("end", onEnd);
      try {
        stream.destroy?.();
      } catch {
        // The source may already have closed after the first chunk.
      }
      if (error) reject(error);
      else resolve();
    };
    const onData = (chunk: unknown) => {
      if (chunk && (!Buffer.isBuffer(chunk) || chunk.length > 0)) finish();
    };
    const onError = () => finish(new Error("first-byte-timeout"));
    const onEnd = () => finish(new Error("first-byte-timeout"));
    const onAbort = () => finish(abortError());
    stream.on("data", onData);
    stream.once?.("error", onError);
    stream.once?.("end", onEnd);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function runProbe(controller: AbortController): Promise<ProbeResult> {
  const startedAt = Date.now();
  const probeId = randomUUID();
  const configuredMagnet = probeMagnet();
  if (controller.signal.aborted) throw abortError();
  if (!configuredMagnet) {
    const result = bridgeNetworkProbeResponseV1Schema.parse({
      protocolVersion: 1,
      probeId,
      status: "unknown",
      phase: "bridge",
      elapsedMs: 0,
      failureCode: "UNSUPPORTED",
    });
    safeLog(probeId, result.phase, result);
    return result;
  }

  let deadlineReached = false;
  const deadline = setTimeout(() => {
    deadlineReached = true;
    controller.abort("deadline");
  }, TOTAL_TIMEOUT_MS);
  const signal = controller.signal;
  let torrent: any;
  let createdTorrent = false;
  let wireSeen = false;
  let clientReady = false;
  let phase: BridgeNetworkProbePhase = "bridge";
  let peerCount = 0;
  let lastLoggedPeerCount: number | undefined;
  let lastPeerLogAt = 0;
  let peerSampleTimer: ReturnType<typeof setInterval> | undefined;
  let onPeer: (() => void) | undefined;
  let onWire: (() => void) | undefined;

  try {
    safeLog(probeId, "bridge", {
      elapsedMs: Date.now() - startedAt,
    });

    const client = await awaitWithAbort(getClient(), signal);
    clientReady = true;
    safeLog(probeId, "bridge", {
      status: "passed",
      elapsedMs: Date.now() - startedAt,
    });
    phase = "discovery";
    const existing: any =
      typeof client.get === "function"
        ? await awaitWithAbort(client.get(configuredMagnet), signal)
        : undefined;
    torrent =
      existing && !existing.destroyed ? existing : client.add(configuredMagnet);
    createdTorrent = !existing;
    peerCount = Number.isFinite(Number(torrent?.numPeers))
      ? Math.max(0, Math.trunc(Number(torrent.numPeers)))
      : 0;

    const samplePeerCount = () => {
      const current = Number.isFinite(Number(torrent?.numPeers))
        ? Math.max(0, Math.trunc(Number(torrent.numPeers)))
        : peerCount;
      peerCount = current;
      const now = Date.now();
      if (
        current === lastLoggedPeerCount ||
        (lastPeerLogAt > 0 && now - lastPeerLogAt < 5_000)
      ) {
        return;
      }
      lastLoggedPeerCount = current;
      lastPeerLogAt = now;
      safeLog(probeId, "peer", {
        peerCount: current,
        elapsedMs: now - startedAt,
      });
    };

    onPeer = () => {
      peerCount = Number.isFinite(Number(torrent?.numPeers))
        ? Math.max(0, Math.trunc(Number(torrent.numPeers)))
        : peerCount + 1;
      samplePeerCount();
    };
    onWire = () => {
      wireSeen = true;
      phase = "wire";
      safeLog(probeId, "wire", {
        peerCount,
        elapsedMs: Date.now() - startedAt,
      });
    };
    torrent.on?.("peer", onPeer);
    torrent.on?.("wire", onWire);
    peerSampleTimer = setInterval(samplePeerCount, 5_000);
    const metadataPromise = waitForReady(torrent, TOTAL_TIMEOUT_MS, {
      signal,
      initialPeerTimeoutMs: INITIAL_PEER_TIMEOUT_MS,
      metadataTimeoutAfterPeerMs: METADATA_TIMEOUT_AFTER_PEER_MS,
      onMetadata: () => {
        phase = "metadata";
        safeLog(probeId, "metadata", {
          peerCount,
          elapsedMs: Date.now() - startedAt,
        });
      },
    });
    await awaitWithAbort(metadataPromise, signal);

    const file = torrent.files?.[0];
    if (!file) {
      const result = failureResult(
        probeId,
        startedAt,
        "metadata",
        "METADATA_UNAVAILABLE",
        peerCount,
      );
      safeLog(probeId, result.phase, result);
      return result;
    }

    phase = "first_byte";
    const remainingMs = Math.max(
      0,
      TOTAL_TIMEOUT_MS - (Date.now() - startedAt),
    );
    safeLog(probeId, "first_byte", {
      peerCount,
      elapsedMs: Date.now() - startedAt,
    });
    await readFirstByte(file, signal, remainingMs);
    const result = bridgeNetworkProbeResponseV1Schema.parse({
      protocolVersion: 1,
      probeId,
      status: "passed",
      phase: "complete",
      elapsedMs: Date.now() - startedAt,
      peerCount,
    });
    safeLog(probeId, result.phase, result);
    return result;
  } catch (error) {
    if (signal.aborted && !deadlineReached) {
      throw abortError();
    }

    if (signal.aborted && deadlineReached) {
      error = new Error(
        phase === "first_byte"
          ? "first-byte-timeout"
          : phase === "discovery"
            ? "Torrent peer discovery timeout"
            : "Torrent metadata timeout after peer connection",
      );
    }

    if (isAbortError(error)) throw abortError();

    const reason = torrentFailureReason(error);
    const failureCode: BridgeNetworkProbeFailureCode = !clientReady
      ? "BRIDGE_UNAVAILABLE"
      : reason === "peer_timeout"
        ? "NO_PEERS"
        : reason === "metadata_timeout"
          ? peerCount > 0 || wireSeen
            ? "METADATA_UNAVAILABLE"
            : "NO_PEERS"
          : reason === "first_byte_timeout"
            ? "FIRST_BYTE_TIMEOUT"
            : String((error as Error | undefined)?.message) ===
                "first-byte-timeout"
              ? "FIRST_BYTE_TIMEOUT"
              : wireSeen
                ? "WIRE_TIMEOUT"
                : "TRACKER_UNREACHABLE";
    const failurePhase: BridgeNetworkProbePhase =
      failureCode === "BRIDGE_UNAVAILABLE"
        ? "bridge"
        : failureCode === "NO_PEERS" || failureCode === "TRACKER_UNREACHABLE"
          ? "discovery"
          : failureCode === "WIRE_TIMEOUT"
            ? "wire"
            : failureCode === "FIRST_BYTE_TIMEOUT"
              ? "first_byte"
              : "metadata";
    const result = failureResult(
      probeId,
      startedAt,
      failurePhase,
      failureCode,
      peerCount,
    );
    safeLog(probeId, result.phase, result);
    return result;
  } finally {
    clearTimeout(deadline);
    if (peerSampleTimer) clearInterval(peerSampleTimer);
    if (onPeer) torrent?.removeListener?.("peer", onPeer);
    if (onWire) torrent?.removeListener?.("wire", onWire);
    if (createdTorrent) await destroyTorrent(torrent);
    addStreamServerBreadcrumb({
      category: "gateway",
      message: "torrent_network_probe.cleanup",
      level: "debug",
      data: {
        probeId,
        peerCount,
        elapsedMs: Date.now() - startedAt,
      },
    });
  }
}

export function runTorrentNetworkProbe(
  signal?: AbortSignal,
): Promise<ProbeResult> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (
    cached &&
    cached.expiresAt > Date.now() &&
    (cached.result.status === "passed" ||
      cached.result.status === "unknown" ||
      cached.result.status === "blocked")
  ) {
    return signal
      ? awaitWithAbort(Promise.resolve(cached.result), signal)
      : Promise.resolve(cached.result);
  }
  if (inFlight) return consumeInFlightProbe(inFlight, signal);

  const controller = new AbortController();
  const entry: InFlightProbe = {
    promise: undefined as unknown as Promise<ProbeResult>,
    controller,
    consumers: 0,
    settled: false,
  };
  const promise = runProbe(controller)
    .then((result) => applyFailureStreak(result))
    .finally(() => {
      entry.settled = true;
      if (inFlight === entry) inFlight = null;
    });
  entry.promise = promise;
  inFlight = entry;
  return consumeInFlightProbe(entry, signal);
}

function consumeInFlightProbe(entry: InFlightProbe, signal?: AbortSignal) {
  entry.consumers += 1;
  const result = signal ? awaitWithAbort(entry.promise, signal) : entry.promise;
  return result.finally(() => {
    entry.consumers = Math.max(0, entry.consumers - 1);
    if (entry.consumers === 0 && !entry.settled && inFlight === entry) {
      entry.controller.abort("no-consumers");
    }
  });
}

export function __resetTorrentNetworkProbeForTests() {
  inFlight?.controller.abort("reset");
  inFlight = null;
  cached = null;
}

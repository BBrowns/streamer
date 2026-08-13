/**
 * Cast Router — Chromecast device discovery & control
 *
 * Uses mDNS discovery via `bonjour-service` and direct `castv2-client`
 * control. Bridge v0 keeps its legacy host-derived device id, while v1 only
 * receives a random process-local id.
 */
import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import type { Client as CastClientType } from "castv2-client";
import {
  getConfiguredBridgePublicOrigin,
  requireBridgeAuth,
  validateCastPlaybackUrlWithDns,
} from "./security.js";
import { redactSensitiveText } from "./redaction.js";

const router = Router();
router.use(requireBridgeAuth);

interface CastDevice {
  /** Legacy v0 id. Never return it from bridge v1. */
  id: string;
  bridgeV1Id: string;
  name: string;
  host: string;
  port: number;
  type: "chromecast";
}

export type CastOperationFailure =
  "device_not_found" | "session_not_found" | "unavailable";

export type CastOperationResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; value: T })
  | { ok: false; reason: CastOperationFailure };

const CAST_CONTENT_TYPES = new Set([
  "video/mp4",
  "application/vnd.apple.mpegurl",
  "application/x-mpegURL",
]);

export function getSafeCastContentType(contentType?: string) {
  return contentType && CAST_CONTENT_TYPES.has(contentType)
    ? contentType
    : "video/mp4";
}

let devices: CastDevice[] = [];
let bonjour: any = null;

async function startDiscovery() {
  if (bonjour) return;
  try {
    const { default: Bonjour } = await import("bonjour-service");
    bonjour = new Bonjour();
    const browser = bonjour.find({ type: "googlecast" });

    browser.on("up", (service: any) => {
      const host = service.addresses?.[0] ?? service.host;
      const id = `${host}:${service.port}`;
      if (!devices.find((device) => device.id === id)) {
        devices.push({
          id,
          bridgeV1Id: randomUUID(),
          name: service.txt?.fn ?? service.name ?? "Chromecast",
          host,
          port: service.port,
          type: "chromecast",
        });
      }
    });

    browser.on("down", (service: any) => {
      const host = service.addresses?.[0] ?? service.host;
      const id = `${host}:${service.port}`;
      devices = devices.filter((device) => device.id !== id);
    });
  } catch (error) {
    console.error(
      "Failed to start bonjour discovery:",
      redactSensitiveText(
        String((error as Error | undefined)?.message ?? error),
      ),
    );
  }
}

async function connectCastClient(device: CastDevice) {
  const { Client } = await import("castv2-client");
  const client = new Client() as unknown as CastClientType;
  await new Promise<void>((resolve, reject) => {
    client.connect({ host: device.host, port: device.port }, (error: Error) => {
      if (error) return reject(error);
      resolve();
    });
  });
  return client;
}

async function playOnCastDevice(
  device: CastDevice,
  input: {
    url: string;
    title?: string;
    contentType?: string;
  },
) {
  const { DefaultMediaReceiver } = await import("castv2-client");
  const client = await connectCastClient(device);
  try {
    const player: any = await new Promise((resolve, reject) => {
      client.launch(DefaultMediaReceiver, (error: Error, app: any) => {
        if (error) return reject(error);
        resolve(app);
      });
    });

    await new Promise<void>((resolve, reject) => {
      player.load(
        {
          contentId: input.url,
          contentType: getSafeCastContentType(input.contentType),
          streamType: "BUFFERED",
          metadata: {
            type: 0,
            metadataType: 0,
            title: input.title ?? "Streamer",
          },
        },
        { autoplay: true },
        (error: Error) => {
          if (error) return reject(error);
          resolve();
        },
      );
    });
  } finally {
    client.close();
  }
}

async function joinCastSession(device: CastDevice) {
  const { DefaultMediaReceiver } = await import("castv2-client");
  const client = await connectCastClient(device);
  try {
    const sessions: any[] = await new Promise((resolve, reject) => {
      client.getSessions((error: Error, currentSessions: any[]) => {
        if (error) return reject(error);
        resolve(currentSessions);
      });
    });
    if (!sessions.length) {
      client.close();
      return undefined;
    }
    const player: any = await new Promise((resolve, reject) => {
      client.join(
        sessions[0],
        DefaultMediaReceiver,
        (error: Error, app: any) => {
          if (error) return reject(error);
          resolve(app);
        },
      );
    });
    return { client, player };
  } catch (error) {
    client.close();
    throw error;
  }
}

async function controlCastDevice(
  device: CastDevice,
  action: "play" | "pause" | "resume" | "seek" | "stop",
  positionSeconds?: number,
): Promise<CastOperationFailure | undefined> {
  const session = await joinCastSession(device);
  if (!session) return "session_not_found";
  try {
    await new Promise<void>((resolve, reject) => {
      const callback = (error: Error) => (error ? reject(error) : resolve());
      if (action === "pause") session.player.pause(callback);
      else if (action === "stop") session.player.stop(callback);
      else if (action === "seek") {
        session.player.seek(positionSeconds, callback);
      } else {
        session.player.play(callback);
      }
    });
    return undefined;
  } finally {
    session.client.close();
  }
}

async function statusForCastDevice(device: CastDevice) {
  const session = await joinCastSession(device);
  if (!session) return undefined;
  try {
    const status: any = await new Promise((resolve, reject) => {
      session.player.getStatus((error: Error, currentStatus: any) =>
        error ? reject(error) : resolve(currentStatus),
      );
    });
    return {
      currentTime: Number(status?.currentTime) || 0,
      duration: Number(status?.media?.duration) || 0,
      isPaused: status?.playerState !== "PLAYING",
      playerState: status?.playerState || "UNKNOWN",
    };
  } finally {
    session.client.close();
  }
}

export async function getBridgeCastDevices() {
  await startDiscovery();
  return getBridgeCastDeviceSnapshot();
}

export function getBridgeCastDeviceSnapshot() {
  return devices.map(({ bridgeV1Id: id, name, type }) => ({
    id,
    name,
    type,
  }));
}

export async function playBridgeCastDevice(input: {
  deviceId: string;
  url: string;
  title?: string;
  contentType?: string;
}): Promise<CastOperationResult> {
  const device = devices.find(
    (candidate) => candidate.bridgeV1Id === input.deviceId,
  );
  if (!device) return { ok: false, reason: "device_not_found" };
  try {
    await playOnCastDevice(device, input);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function controlBridgeCastDevice(input: {
  deviceId: string;
  action: "play" | "pause" | "resume" | "seek" | "stop";
  positionSeconds?: number;
}): Promise<CastOperationResult> {
  const device = devices.find(
    (candidate) => candidate.bridgeV1Id === input.deviceId,
  );
  if (!device) return { ok: false, reason: "device_not_found" };
  try {
    const failure = await controlCastDevice(
      device,
      input.action,
      input.positionSeconds,
    );
    return failure ? { ok: false, reason: failure } : { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function getBridgeCastStatus(deviceId: string): Promise<
  CastOperationResult<{
    currentTime: number;
    duration: number;
    isPaused: boolean;
    playerState: string;
  }>
> {
  const device = devices.find((candidate) => candidate.bridgeV1Id === deviceId);
  if (!device) return { ok: false, reason: "device_not_found" };
  try {
    const status = await statusForCastDevice(device);
    return status
      ? { ok: true, value: status }
      : { ok: false, reason: "session_not_found" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

router.get("/devices", async (_req: Request, res: Response) => {
  await startDiscovery();
  res.json(devices.map(({ id, name, type }) => ({ id, name, type })));
});

router.post("/play", async (req: Request, res: Response) => {
  const { deviceId, url, title, contentType } = req.body as {
    deviceId: string;
    url: string;
    title?: string;
    contentType?: string;
  };
  const device = devices.find((candidate) => candidate.id === deviceId);
  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }
  const bridgeOrigin = getConfiguredBridgePublicOrigin();
  if (!bridgeOrigin) {
    return res.status(400).json({ error: "CAST_SOURCE_REJECTED" });
  }
  const safeUrl = await validateCastPlaybackUrlWithDns(url, {
    allowedHosts: [new URL(bridgeOrigin).hostname],
  });
  if (!safeUrl.ok) {
    return res.status(400).json({ error: safeUrl.reason });
  }

  try {
    await playOnCastDevice(device, {
      url: safeUrl.url!,
      title,
      contentType,
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      error: redactSensitiveText(
        String((error as Error | undefined)?.message ?? "Failed to cast"),
      ),
    });
  }
});

router.post("/control", async (req: Request, res: Response) => {
  const { deviceId, action, position } = req.body as {
    deviceId: string;
    action: string;
    position?: number;
  };
  const device = devices.find((candidate) => candidate.id === deviceId);
  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }
  if (!["pause", "resume", "play", "stop", "seek"].includes(action)) {
    return res.status(400).json({ error: "Unknown action" });
  }
  if (
    action === "seek" &&
    (typeof position !== "number" || !Number.isFinite(position) || position < 0)
  ) {
    return res.status(400).json({ error: "Invalid seek position" });
  }

  try {
    const failure = await controlCastDevice(
      device,
      action as "play" | "pause" | "resume" | "seek" | "stop",
      position,
    );
    if (failure === "session_not_found") {
      return res.status(404).json({ error: "No active session" });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      error: redactSensitiveText(
        String((error as Error | undefined)?.message ?? "Control failed"),
      ),
    });
  }
});

router.get("/status/:deviceId", async (req: Request, res: Response) => {
  const device = devices.find(
    (candidate) => candidate.id === req.params.deviceId,
  );
  if (!device) return res.status(404).json({ error: "Device not found" });

  try {
    const status = await statusForCastDevice(device);
    if (!status) {
      return res.status(404).json({ error: "No active session" });
    }
    return res.json(status);
  } catch (error) {
    return res.status(500).json({
      error: redactSensitiveText(
        String((error as Error | undefined)?.message ?? "Status failed"),
      ),
    });
  }
});

export function __setCastDevicesForTests(
  values: Array<{
    bridgeV1Id?: string;
    host: string;
    port: number;
    name?: string;
  }>,
) {
  devices = values.map((value) => ({
    id: `${value.host}:${value.port}`,
    bridgeV1Id: value.bridgeV1Id ?? randomUUID(),
    name: value.name ?? "Chromecast",
    host: value.host,
    port: value.port,
    type: "chromecast",
  }));
}

export const castRouter = router;

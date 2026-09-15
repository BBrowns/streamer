import { randomUUID } from "node:crypto";
import { addStreamServerBreadcrumb } from "./sentry.js";

const ids = new WeakMap<object, string>();
const observed = new WeakSet<object>();
const metadataObserved = new WeakSet<object>();

export type TorrentMetadataDiagnosticCategory =
  | "metadata_unsupported"
  | "metadata_missing_at_peer"
  | "metadata_invalid"
  | "metadata_rejected"
  | "metadata_warning"
  | "tracker_warning"
  | "discovery_warning"
  | "wire_timeout"
  | "torrent_warning";

interface MetadataObservationState {
  counts: Map<TorrentMetadataDiagnosticCategory, number>;
  metadataReceived: boolean;
  discoveredPeerCount: number;
}

const metadataStates = new WeakMap<object, MetadataObservationState>();

export function getTorrentRuntimeId(torrent: object) {
  let id = ids.get(torrent);
  if (!id) {
    id = randomUUID();
    ids.set(torrent, id);
  }
  return id;
}

function getMetadataState(torrent: object): MetadataObservationState {
  let state = metadataStates.get(torrent);
  if (!state) {
    state = {
      counts: new Map(),
      metadataReceived: false,
      discoveredPeerCount: 0,
    };
    metadataStates.set(torrent, state);
  }
  return state;
}

function classifyUtMetadataWarning(
  value: unknown,
): TorrentMetadataDiagnosticCategory {
  const message = String(value).toLowerCase();
  if (message.includes("does not support ut_metadata")) {
    return "metadata_unsupported";
  }
  if (message.includes("does not have metadata")) {
    return "metadata_missing_at_peer";
  }
  if (message.includes("invalid metadata")) return "metadata_invalid";
  if (message.includes("reject")) return "metadata_rejected";
  return "metadata_warning";
}

function classifyTorrentWarning(
  value: unknown,
): TorrentMetadataDiagnosticCategory {
  const message = String(value).toLowerCase();
  if (message.includes("tracker") || message.includes("announce")) {
    return "tracker_warning";
  }
  if (
    message.includes("dht") ||
    message.includes("lsd") ||
    message.includes("discovery") ||
    message.includes("fetch failed") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("error connecting") ||
    message.includes("timed out")
  ) {
    return "discovery_warning";
  }
  return "torrent_warning";
}

function recordMetadataDiagnostic(
  torrent: object,
  category: TorrentMetadataDiagnosticCategory,
) {
  const state = getMetadataState(torrent);
  const count = (state.counts.get(category) ?? 0) + 1;
  state.counts.set(category, count);

  // Emit only the first occurrence of each category. The snapshot below
  // carries counts for the terminal metadata outcome without echoing raw
  // warning text or peer/source details.
  if (count !== 1) return;
  addStreamServerBreadcrumb({
    category: "gateway",
    message: "torrent.metadata_diagnostic",
    level: "debug",
    data: {
      torrentRuntimeId: getTorrentRuntimeId(torrent),
      diagnostic: category,
    },
  });
}

export function getTorrentMetadataDiagnosticSnapshot(torrent: object) {
  const state = metadataStates.get(torrent);
  const peerCount = Number((torrent as { numPeers?: unknown }).numPeers);
  const connectedPeerCount = Number.isFinite(peerCount)
    ? Math.max(0, Math.trunc(peerCount))
    : 0;
  if (!state) {
    return {
      categories: [],
      counts: {},
      metadataReceived: false,
      observed: false,
      discoveredPeerCount: 0,
      connectedPeerCount,
    };
  }

  return {
    categories: [...state.counts.keys()],
    counts: Object.fromEntries(state.counts),
    metadataReceived: state.metadataReceived,
    observed: true,
    discoveredPeerCount: state.discoveredPeerCount,
    connectedPeerCount,
  };
}

/**
 * Observe only bounded, safe metadata/discovery outcomes for a torrent.
 * WebTorrent exposes the ut_metadata extension on each wire, while tracker
 * and discovery warnings arrive on the torrent itself. Raw messages stay
 * local to classification and are never emitted or persisted.
 */
export function observeTorrentMetadata(torrent: {
  on?: (event: string, callback: (...args: any[]) => void) => unknown;
  once?: (event: string, callback: (...args: any[]) => void) => unknown;
  removeListener?: (
    event: string,
    callback: (...args: any[]) => void,
  ) => unknown;
}) {
  if (metadataObserved.has(torrent)) return;
  metadataObserved.add(torrent);

  const state = getMetadataState(torrent);
  const wireCleanups = new Set<() => void>();
  const onWire = (wire: any) => {
    const metadataExtension = wire?.ut_metadata;
    if (metadataExtension?.on) {
      const onWarning = (warning: unknown) =>
        recordMetadataDiagnostic(torrent, classifyUtMetadataWarning(warning));
      metadataExtension.on("warning", onWarning);
      wireCleanups.add(() => {
        metadataExtension.removeListener?.("warning", onWarning);
      });
    }

    if (wire?.once) {
      const onTimeout = () => recordMetadataDiagnostic(torrent, "wire_timeout");
      wire.once("timeout", onTimeout);
      wireCleanups.add(() => wire.removeListener?.("timeout", onTimeout));
    }
  };
  const onWarning = (warning: unknown) =>
    recordMetadataDiagnostic(torrent, classifyTorrentWarning(warning));
  const onMetadata = () => {
    state.metadataReceived = true;
  };
  const onPeer = () => {
    state.discoveredPeerCount += 1;
  };
  const cleanup = () => {
    torrent.removeListener?.("wire", onWire);
    torrent.removeListener?.("peer", onPeer);
    torrent.removeListener?.("warning", onWarning);
    torrent.removeListener?.("metadata", onMetadata);
    for (const removeWireListeners of wireCleanups) removeWireListeners();
    wireCleanups.clear();
  };

  torrent.on?.("wire", onWire);
  torrent.on?.("peer", onPeer);
  torrent.on?.("warning", onWarning);
  torrent.on?.("metadata", onMetadata);
  torrent.once?.("close", cleanup);
}

/** One changed-value sampler per active runtime, even when jobs share it. */
export function observeTorrentPeers(torrent: {
  numPeers?: number;
  once?: (event: string, callback: () => void) => unknown;
  on?: (event: string, callback: () => void) => unknown;
}) {
  if (observed.has(torrent)) return;
  observed.add(torrent);
  const torrentRuntimeId = getTorrentRuntimeId(torrent);
  let previous: number | undefined;
  const sample = () => {
    const count = Number(torrent.numPeers);
    const peerCount = Number.isFinite(count)
      ? Math.max(0, Math.trunc(count))
      : 0;
    if (peerCount === previous) return;
    addStreamServerBreadcrumb({
      category: "gateway",
      message: "torrent.peer_count",
      level: "debug",
      data: { torrentRuntimeId, peerCount, previousPeerCount: previous },
    });
    previous = peerCount;
  };
  sample();
  const timer = setInterval(sample, 5000);
  timer.unref?.();
  if (torrent.once) torrent.once("close", () => clearInterval(timer));
  else torrent.on?.("close", () => clearInterval(timer));
}

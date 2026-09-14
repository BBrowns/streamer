import { randomUUID } from "node:crypto";
import { addStreamServerBreadcrumb } from "./sentry.js";

const ids = new WeakMap<object, string>();
const observed = new WeakSet<object>();

export function getTorrentRuntimeId(torrent: object) {
  let id = ids.get(torrent);
  if (!id) {
    id = randomUUID();
    ids.set(torrent, id);
  }
  return id;
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

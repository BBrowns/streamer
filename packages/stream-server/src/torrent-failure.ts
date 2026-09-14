/** Process-local failures. Causes may contain source data and must never be logged. */
export type TorrentFailureReason =
  | "peer_timeout"
  | "metadata_timeout"
  | "first_byte_timeout"
  | "torrent_destroyed"
  | "torrent_error"
  | "media_server_unavailable"
  | "file_selection_failed"
  | "audio_probe_failed"
  | "remux_failed";

const messages: Record<TorrentFailureReason, string> = {
  peer_timeout: "Torrent peer discovery timeout",
  metadata_timeout: "Torrent metadata timeout after peer connection",
  first_byte_timeout: "Torrent file first byte timeout",
  torrent_destroyed: "Torrent source closed before preparation completed",
  torrent_error: "Torrent source failed",
  media_server_unavailable: "Torrent media server is unavailable",
  file_selection_failed: "Torrent has no playable video files",
  audio_probe_failed: "The source audio could not be inspected",
  remux_failed: "A compatible stream could not be prepared",
};

export class TorrentPreparationError extends Error {
  readonly code = "TORRENT_PREPARATION_FAILED";
  constructor(
    readonly reason: TorrentFailureReason,
    cause?: unknown,
  ) {
    super(messages[reason], { cause });
    this.name = "TorrentPreparationError";
  }
}

const failures = new WeakMap<object, TorrentPreparationError>();

export function rememberTorrentFailure(torrent: object, cause: unknown) {
  if (!failures.has(torrent)) {
    failures.set(torrent, new TorrentPreparationError("torrent_error", cause));
  }
}

export function assertTorrentUsable(torrent: { destroyed?: boolean }) {
  const failure = failures.get(torrent);
  if (failure) throw failure;
  if (torrent.destroyed) throw new TorrentPreparationError("torrent_destroyed");
}

export function torrentFailureReason(
  error: unknown,
): TorrentFailureReason | undefined {
  if (error instanceof TorrentPreparationError) return error.reason;
  // Exact legacy boundary messages remain compatible while callers move to typed errors.
  const message = error instanceof Error ? error.message : "";
  if (message === "Torrent peer discovery timeout") return "peer_timeout";
  if (
    message === "Torrent ready timeout" ||
    message === "Torrent metadata timeout after peer connection"
  )
    return "metadata_timeout";
  if (message === "Torrent file first byte timeout")
    return "first_byte_timeout";
  return undefined;
}

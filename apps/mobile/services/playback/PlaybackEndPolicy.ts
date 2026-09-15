/**
 * Progressive gateway media can emit a native end event when the currently
 * materialized file segment ends. It is not a completed title until the
 * bridge has handed the player a seekable cache.
 */
export function shouldTreatPlaybackEndAsPremature({
  isProgressiveRemux,
  hasSeekableHandoff,
  currentTime,
  duration,
  expectedDuration = 0,
}: {
  isProgressiveRemux: boolean;
  hasSeekableHandoff: boolean;
  currentTime: number;
  duration: number;
  /**
   * The title/episode duration from metadata. HLS exposes the currently
   * published window as its media duration, so an HLS source can otherwise
   * look complete when the torrent/file ends before the actual title does.
   */
  expectedDuration?: number;
}) {
  if (hasSeekableHandoff) return false;

  // HLS duration is a rolling/published window, not necessarily the full
  // title duration. Treat a finite HLS end far before metadata duration as a
  // candidate-local failure so fallback can try the next source.
  if (
    !isProgressiveRemux &&
    Number.isFinite(expectedDuration) &&
    expectedDuration > 0 &&
    Number.isFinite(currentTime) &&
    currentTime < expectedDuration - 30
  ) {
    return true;
  }

  if (!isProgressiveRemux) return false;

  // An unknown/infinite duration is the normal progressive case. A finite
  // duration can still be a genuinely complete media file, so preserve the
  // normal completion event when the player reached that known endpoint.
  if (!Number.isFinite(duration) || duration <= 0) return true;
  return !Number.isFinite(currentTime) || currentTime < duration - 0.5;
}

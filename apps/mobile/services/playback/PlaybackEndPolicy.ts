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
}: {
  isProgressiveRemux: boolean;
  hasSeekableHandoff: boolean;
  currentTime: number;
  duration: number;
}) {
  if (!isProgressiveRemux || hasSeekableHandoff) return false;

  // An unknown/infinite duration is the normal progressive case. A finite
  // duration can still be a genuinely complete media file, so preserve the
  // normal completion event when the player reached that known endpoint.
  if (!Number.isFinite(duration) || duration <= 0) return true;
  return !Number.isFinite(currentTime) || currentTime < duration - 0.5;
}

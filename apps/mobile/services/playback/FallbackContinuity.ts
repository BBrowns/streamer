export interface FallbackContinuitySnapshot {
  resumeAt: number;
  shouldPlay: boolean;
  sourceUri: string | null;
  attempt: number;
}

export function captureFallbackContinuity({
  currentTime,
  isPlaying,
  sourceUri,
  attempt,
}: {
  currentTime: number;
  isPlaying: boolean;
  sourceUri: string | null;
  attempt: number;
}): FallbackContinuitySnapshot {
  return {
    resumeAt: Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0,
    shouldPlay: isPlaying,
    sourceUri,
    attempt: Math.max(1, Math.floor(attempt)),
  };
}

export function resolveFallbackResumePosition(
  snapshot: FallbackContinuitySnapshot,
  duration: number,
) {
  const knownDuration =
    Number.isFinite(duration) && duration > 0 ? duration : undefined;
  return knownDuration
    ? Math.min(snapshot.resumeAt, Math.max(0, knownDuration - 0.25))
    : snapshot.resumeAt;
}

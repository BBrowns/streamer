export const PLAYBACK_STALL_TIMEOUT_MS = 15_000;
export const PLAYBACK_STALL_CHECK_INTERVAL_MS = 1_000;
export const PLAYBACK_SEEK_GRACE_PERIOD_MS = 10_000;

// Avoid treating tiny floating-point jitter as progress, while still keeping
// a deliberately slow but advancing stream out of the fallback path.
const PLAYBACK_PROGRESS_EPSILON_SECONDS = 0.05;

export interface PlaybackProgressSnapshot {
  currentTime: number | null | undefined;
  bufferedPosition: number | null | undefined;
}

export interface PlaybackStallWatchdogSnapshot {
  now: number;
  lastProgressAt: number;
  hasStarted: boolean;
  isPlaying: boolean;
  isVisible: boolean;
  isSeeking: boolean;
  isCasting: boolean;
  fallbackInFlight: boolean;
  fallbackAlreadyTriggered: boolean;
  timeoutMs?: number;
}

function hasAdvanced(
  next: number | null | undefined,
  previous: number | null | undefined,
) {
  return (
    typeof next === "number" &&
    Number.isFinite(next) &&
    (typeof previous !== "number" ||
      !Number.isFinite(previous) ||
      next > previous + PLAYBACK_PROGRESS_EPSILON_SECONDS)
  );
}

/**
 * A source is making progress when either the playhead or its buffered edge
 * moves forward. The buffer signal matters for low-bitrate starts where the
 * first `timeUpdate` can lag behind the first decoded segment.
 */
export function hasPlaybackProgressed(
  previous: PlaybackProgressSnapshot,
  next: PlaybackProgressSnapshot,
) {
  return (
    hasAdvanced(next.currentTime, previous.currentTime) ||
    hasAdvanced(next.bufferedPosition, previous.bufferedPosition)
  );
}

/**
 * Keep the policy separate from the player events so the player never treats
 * a manual pause, a hidden app, a user seek, or a cast handoff as a failed
 * source. The caller owns the one-shot flag before invoking fallback.
 */
export function shouldAdvanceAfterPlaybackStall({
  now,
  lastProgressAt,
  hasStarted,
  isPlaying,
  isVisible,
  isSeeking,
  isCasting,
  fallbackInFlight,
  fallbackAlreadyTriggered,
  timeoutMs = PLAYBACK_STALL_TIMEOUT_MS,
}: PlaybackStallWatchdogSnapshot) {
  if (
    !hasStarted ||
    !isPlaying ||
    !isVisible ||
    isSeeking ||
    isCasting ||
    fallbackInFlight ||
    fallbackAlreadyTriggered
  ) {
    return false;
  }

  return now - lastProgressAt >= timeoutMs;
}

import type { WatchProgressDurationSource } from "@streamer/shared";

const POSITION_JITTER_SECONDS = 3;
const MAX_UNINTENTIONAL_RATE = 4;
const FORWARD_JUMP_GRACE_SECONDS = 10;

export interface PlaybackProgressSnapshot {
  currentTime: number;
  duration: number;
  durationSource: WatchProgressDurationSource;
}

export function parseRuntimeSeconds(runtime?: string | null): number {
  if (!runtime) return 0;
  const value = runtime.trim().toLowerCase();
  if (!value) return 0;

  const hours = Number(value.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/)?.[1] ?? 0);
  const minutes = Number(
    value.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?/)?.[1] ?? 0,
  );
  if (hours > 0 || minutes > 0) {
    return Math.round(hours * 3600 + minutes * 60);
  }

  const plainMinutes = Number(value.match(/^(\d+(?:\.\d+)?)$/)?.[1] ?? 0);
  return plainMinutes > 0 ? Math.round(plainMinutes * 60) : 0;
}

export function resolveProgressDuration({
  observedDuration,
  metadataRuntime,
  isProgressiveRemux,
  hasSeekableHandoff,
}: {
  observedDuration: number;
  metadataRuntime?: string | null;
  isProgressiveRemux: boolean;
  hasSeekableHandoff: boolean;
}): { duration: number; durationSource: WatchProgressDurationSource } {
  const metadataDuration = parseRuntimeSeconds(metadataRuntime);
  if (isProgressiveRemux && !hasSeekableHandoff) {
    return metadataDuration > 0
      ? { duration: metadataDuration, durationSource: "metadata" }
      : { duration: 0, durationSource: "unknown" };
  }

  if (Number.isFinite(observedDuration) && observedDuration > 0) {
    return { duration: observedDuration, durationSource: "media" };
  }
  if (metadataDuration > 0) {
    return { duration: metadataDuration, durationSource: "metadata" };
  }
  return { duration: 0, durationSource: "unknown" };
}

/**
 * Accepts playback position only from player events or explicit user intent.
 * Polling code reads this clock; it never treats a transient player property
 * during source replacement as watched progress.
 */
export class PlaybackProgressClock {
  private currentTime = 0;
  private lastAcceptedAt = 0;
  private replacementActive = false;

  reset(position = 0, now = Date.now()) {
    this.currentTime = Number.isFinite(position) && position > 0 ? position : 0;
    this.lastAcceptedAt = now;
    this.replacementActive = false;
  }

  recordExplicitSeek(position: number, now = Date.now()) {
    if (!Number.isFinite(position) || position < 0) return;
    this.currentTime = position;
    this.lastAcceptedAt = now;
  }

  beginSourceReplacement() {
    this.replacementActive = true;
  }

  completeSourceReplacement(resumeAt: number, now = Date.now()) {
    this.replacementActive = false;
    this.recordExplicitSeek(resumeAt, now);
  }

  acceptTimeUpdate(position: number, now = Date.now()): boolean {
    if (this.replacementActive || !Number.isFinite(position) || position < 0) {
      return false;
    }

    if (this.lastAcceptedAt === 0) {
      this.currentTime = position;
      this.lastAcceptedAt = now;
      return true;
    }

    const elapsedSeconds = Math.max(0, (now - this.lastAcceptedAt) / 1_000);
    const forwardLimit =
      this.currentTime +
      elapsedSeconds * MAX_UNINTENTIONAL_RATE +
      FORWARD_JUMP_GRACE_SECONDS;
    const backwardLimit = this.currentTime - POSITION_JITTER_SECONDS;
    if (position > forwardLimit || position < backwardLimit) {
      return false;
    }

    this.currentTime = position;
    this.lastAcceptedAt = now;
    return true;
  }

  snapshot(
    duration: number,
    durationSource: WatchProgressDurationSource,
  ): PlaybackProgressSnapshot {
    const trustedDuration =
      Number.isFinite(duration) && duration > 0 ? duration : 0;
    return {
      currentTime:
        trustedDuration > 0 &&
        (durationSource === "metadata" || durationSource === "media")
          ? Math.min(this.currentTime, trustedDuration)
          : this.currentTime,
      duration: trustedDuration,
      durationSource: trustedDuration > 0 ? durationSource : "unknown",
    };
  }
}

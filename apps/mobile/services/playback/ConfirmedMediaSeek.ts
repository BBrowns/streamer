import type { MediaTimeRange } from "./MediaPlayerAdapter";

export interface ConfirmedSeekObservation {
  currentTime: number;
  duration?: number;
  status: string;
  bufferedRanges: readonly MediaTimeRange[];
}

export interface ConfirmedSeekOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  toleranceSeconds?: number;
  pollIntervalMs?: number;
}

export class SeekSupersededError extends Error {
  constructor() {
    super("The seek was superseded by a newer seek or source change.");
    this.name = "SeekSupersededError";
  }
}

export class SeekAbortedError extends Error {
  constructor() {
    super("The seek was cancelled.");
    this.name = "AbortError";
  }
}

function bufferedAt(ranges: readonly MediaTimeRange[], position: number) {
  return ranges.some(
    ({ start, end }) =>
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start &&
      start <= position + 0.25 &&
      end >= position - 0.25,
  );
}

/**
 * A native seek discontinuity is not enough to report success. Wait until the
 * player reports the requested media time and has loaded media at that point.
 */
export function confirmMediaSeek({
  target,
  request,
  observe,
  isCurrent,
  signal,
  timeoutMs = 20_000,
  toleranceSeconds = 1.25,
  pollIntervalMs = 100,
}: ConfirmedSeekOptions & {
  target: number;
  request: () => void;
  observe: () => ConfirmedSeekObservation;
  isCurrent: () => boolean;
}): Promise<number> {
  if (!Number.isFinite(target) || target < 0) {
    return Promise.reject(
      new RangeError("Seek position must be non-negative."),
    );
  }
  if (signal?.aborted) return Promise.reject(new SeekAbortedError());

  try {
    request();
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      finish(() => reject(new Error("Timed out waiting for the seek target.")));
    }, timeoutMs);
    const interval = setInterval(check, pollIntervalMs);
    const onAbort = () => finish(() => reject(new SeekAbortedError()));

    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(interval);
      signal?.removeEventListener("abort", onAbort);
      settle();
    };

    function check() {
      if (signal?.aborted) {
        finish(() => reject(new SeekAbortedError()));
        return;
      }
      if (!isCurrent()) {
        finish(() => reject(new SeekSupersededError()));
        return;
      }

      let observation: ConfirmedSeekObservation;
      try {
        observation = observe();
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      if (observation.status === "error" || observation.status === "idle") {
        finish(() =>
          reject(new Error("The media source is not ready to seek.")),
        );
        return;
      }
      if (
        observation.status === "ready" &&
        Math.abs(observation.currentTime - target) <= toleranceSeconds &&
        (bufferedAt(observation.bufferedRanges, target) ||
          (Number.isFinite(observation.duration) &&
            (observation.duration ?? 0) > 0 &&
            Math.abs(target - (observation.duration ?? 0)) <= 0.25))
      ) {
        finish(() => resolve(observation.currentTime));
      }
    }

    signal?.addEventListener("abort", onAbort, { once: true });
    check();
  });
}

export interface SeekableHandoffVideoPlayer {
  status?: string;
  currentTime: number;
  playing: boolean;
  play(): void;
  pause(): void;
  replaceAsync(source: string): Promise<void>;
  addListener?: (
    event: "sourceLoad" | "statusChange",
    listener: (payload?: { status?: string }) => void,
  ) => { remove?: () => void } | undefined;
}

export const SEEKABLE_HANDOFF_READY_TIMEOUT_MS = 15_000;

function createAbortError() {
  const error = new Error("Seekable playback handoff was cancelled.");
  error.name = "AbortError";
  return error;
}

/**
 * Replaces a live progressive source with its range-seekable representation
 * without changing the owning playback session. `replaceAsync` is important
 * on iOS because synchronous source replacement can block the UI thread.
 *
 * `sourceLoad` is sufficient to restore the position; `readyToPlay` is kept
 * as a second signal because platforms don't emit those events in exactly the
 * same order. The caller owns recovery policy when this throws.
 */
export async function replaceWithSeekableSource({
  player,
  source,
  resumeAt,
  shouldResume,
  signal,
  timeoutMs = SEEKABLE_HANDOFF_READY_TIMEOUT_MS,
}: {
  player: SeekableHandoffVideoPlayer;
  source: string;
  resumeAt: number;
  shouldResume: boolean;
  signal: AbortSignal;
  timeoutMs?: number;
}) {
  if (signal.aborted) throw createAbortError();

  let sourceLoadSubscription: { remove?: () => void } | undefined;
  let statusSubscription: { remove?: () => void } | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  let replacementStarted = false;
  // On web and Android `replaceAsync` can resolve as soon as the new source
  // has been handed to the native player. Do not mistake a `readyToPlay`
  // status left over from the live source for readiness of the replacement.
  const statusBeforeReplacement = player.status;

  const sourceReady = new Promise<"ready" | "aborted" | "timed_out">(
    (resolve) => {
      let settled = false;
      const cleanup = () => {
        sourceLoadSubscription?.remove?.();
        statusSubscription?.remove?.();
        if (timeout) clearTimeout(timeout);
        if (onAbort) signal.removeEventListener("abort", onAbort);
      };
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const ready = () => finish(() => resolve("ready"));
      const abort = () => finish(() => resolve("aborted"));
      const timedOut = () => finish(() => resolve("timed_out"));

      sourceLoadSubscription = player.addListener?.("sourceLoad", () => {
        if (replacementStarted) ready();
      });
      statusSubscription = player.addListener?.("statusChange", (event) => {
        if (replacementStarted && event?.status === "readyToPlay") ready();
      });
      onAbort = abort;
      signal.addEventListener("abort", onAbort, { once: true });
      timeout = setTimeout(timedOut, timeoutMs);
    },
  );

  try {
    let removeReplacementAbortListener: (() => void) | undefined;
    const replacementAbort = new Promise<never>((_, reject) => {
      const rejectOnAbort = () => reject(createAbortError());
      signal.addEventListener("abort", rejectOnAbort, { once: true });
      removeReplacementAbortListener = () =>
        signal.removeEventListener("abort", rejectOnAbort);
    });
    try {
      replacementStarted = true;
      await Promise.race([player.replaceAsync(source), replacementAbort]);
    } finally {
      removeReplacementAbortListener?.();
    }
    if (
      player.status === "readyToPlay" &&
      statusBeforeReplacement !== "readyToPlay"
    ) {
      // Some web/native implementations resolve replaceAsync after the source
      // is ready without dispatching a second observable event. This is safe
      // only when the replacement demonstrably changed the previous status.
      sourceLoadSubscription?.remove?.();
      statusSubscription?.remove?.();
    } else {
      const readiness = await sourceReady;
      if (readiness === "aborted") throw createAbortError();
      if (readiness === "timed_out") {
        throw new Error("Seekable playback handoff timed out.");
      }
    }
    if (signal.aborted) throw createAbortError();

    if (Number.isFinite(resumeAt) && resumeAt > 0) {
      player.currentTime = resumeAt;
    }
    if (shouldResume) player.play();
    else player.pause();
  } finally {
    sourceLoadSubscription?.remove?.();
    statusSubscription?.remove?.();
    if (timeout) clearTimeout(timeout);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

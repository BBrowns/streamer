import * as Crypto from "expo-crypto";
import { usePlaybackSessionStore } from "../../stores/playbackSessionStore";
import { isPlaybackPlanAbortError } from "./PlaybackPlanService";
import {
  playBest,
  type PlaybackOrchestratorInput,
  type PlaybackOrchestratorResult,
} from "./PlaybackOrchestrator";
import { cancelPlaybackSession } from "./PlaybackSessionPlaybackService";

/**
 * The player route is allowed to open before planning finishes. Keep the
 * in-flight plan here rather than in Zustand so it never survives an app
 * restart or serializes transient source metadata.
 */
const PLAYBACK_LAUNCH_TTL_MS = 30_000;

type PendingPlaybackLaunch = {
  controller: AbortController;
  cancelled: boolean;
  result: PlaybackOrchestratorResult | null;
  promise: Promise<PlaybackOrchestratorResult>;
  expiryTimer: ReturnType<typeof setTimeout> | null;
};

const pendingPlaybackLaunches = new Map<string, PendingPlaybackLaunch>();

function cancelledLaunchError() {
  const error = new Error("Playback launch was cancelled.");
  error.name = "AbortError";
  return error;
}

function discardSession(sessionId: string | undefined, reason: string) {
  if (!sessionId) return;
  cancelPlaybackSession(sessionId, reason);
  usePlaybackSessionStore.getState().removeSession(sessionId);
}

function clearLaunchExpiry(entry: PendingPlaybackLaunch) {
  if (!entry.expiryTimer) return;
  clearTimeout(entry.expiryTimer);
  entry.expiryTimer = null;
}

function scheduleLaunchExpiry(launchId: string, entry: PendingPlaybackLaunch) {
  entry.expiryTimer = setTimeout(() => {
    entry.expiryTimer = null;
    if (pendingPlaybackLaunches.get(launchId) !== entry) return;
    if (!entry.result) entry.controller.abort();
    if (entry.result) {
      discardSession(entry.result.sessionId, "Playback launch expired.");
    }
    pendingPlaybackLaunches.delete(launchId);
  }, PLAYBACK_LAUNCH_TTL_MS);
}

export function beginPlaybackLaunch(input: PlaybackOrchestratorInput) {
  const launchId = Crypto.randomUUID();
  const controller = new AbortController();
  const entry: PendingPlaybackLaunch = {
    controller,
    cancelled: false,
    result: null,
    promise: Promise.resolve(undefined as never),
    expiryTimer: null,
  };

  entry.promise = playBest(input, { signal: controller.signal }).then(
    (result) => {
      entry.result = result;
      if (entry.cancelled) {
        discardSession(result.sessionId, "Playback launch was cancelled.");
        throw cancelledLaunchError();
      }
      return result;
    },
  );
  pendingPlaybackLaunches.set(launchId, entry);
  // A navigation interruption can leave a launch unclaimed. Keep its rejection
  // observed while callers still receive the original promise when they mount.
  void entry.promise.catch(() => undefined);
  scheduleLaunchExpiry(launchId, entry);

  return launchId;
}

export function getPlaybackLaunch(
  launchId: string,
): Promise<PlaybackOrchestratorResult> | null {
  return pendingPlaybackLaunches.get(launchId)?.promise ?? null;
}

export function cancelPlaybackLaunch(launchId: string, reason?: string) {
  const entry = pendingPlaybackLaunches.get(launchId);
  if (!entry) return false;

  entry.cancelled = true;
  entry.controller.abort();
  if (entry.result) {
    discardSession(
      entry.result.sessionId,
      reason || "Playback launch cancelled.",
    );
  }
  clearLaunchExpiry(entry);
  pendingPlaybackLaunches.delete(launchId);
  return true;
}

/** The player has taken ownership of the resulting session/runtime state. */
export function releasePlaybackLaunch(launchId: string) {
  const entry = pendingPlaybackLaunches.get(launchId);
  if (!entry) return;
  clearLaunchExpiry(entry);
  pendingPlaybackLaunches.delete(launchId);
}

export function isPlaybackLaunchCancelled(error: unknown) {
  return isPlaybackPlanAbortError(error);
}

export function resetPlaybackLaunchesForTests() {
  for (const [launchId] of pendingPlaybackLaunches) {
    cancelPlaybackLaunch(launchId, "Test cleanup.");
  }
}

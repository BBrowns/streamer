import type {
  DeviceProfile,
  PlaybackAction,
  PlaybackPlan,
  PlaybackPlanRequest,
  Stream,
} from "@streamer/shared";
import { playbackPlanSchema } from "@streamer/shared";
import { api } from "../api";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";
import {
  normalizePreferredQualities,
  usePlayerStore,
} from "../../stores/playerStore";
import { useAuthStore } from "../../stores/authStore";
import { getChromecastDeviceProfile, getDeviceProfile } from "./deviceProfile";
import { buildActionBridgeHint } from "../actionPreflight";

/**
 * Planner responses contain transient source data. Keep them in memory only,
 * just long enough for Detail prefetch, Play, More Sources and the inspector
 * to share one result instead of fanning out to every add-on repeatedly.
 */
export const PLAYBACK_PLAN_CACHE_TTL_MS = 30_000;
const PARTIAL_PLAYBACK_PLAN_CACHE_TTL_MS = 500;
const FORCE_REFRESH_KEY_SUFFIX = "\u0000force-refresh";
// Most add-ons time out at five seconds. Give an already-failed partial plan
// one cancellable recovery window long enough for that normal late response,
// without making first Play wait for it.
const PARTIAL_DISCOVERY_RETRY_DELAYS_MS = [750, 1_250, 2_000, 2_500] as const;

export type PlaybackPlanInput = Pick<
  PlaybackPlanRequest,
  "type" | "id" | "season" | "episode"
> & {
  action: PlaybackAction;
  deviceProfile?: DeviceProfile;
};

export type PlaybackPlanRequestOptions = {
  /** Abort this caller without cancelling another screen using the same plan. */
  signal?: AbortSignal;
  /** Skip a completed entry, for an explicit viewer Retry. */
  forceRefresh?: boolean;
  /**
   * Detail can warm a plan before the viewer presses Play. That work must not
   * keep an interactive request alive after the viewer explicitly cancels it.
   */
  consumer?: "foreground" | "prefetch";
};

type PreparedPlaybackPlanRequest = {
  payload: PlaybackPlanRequest;
  cacheKey: string;
};

type CachedPlaybackPlan = {
  plan: PlaybackPlan;
  expiresAt: number;
};

type InFlightPlaybackPlan = {
  cacheKey: string;
  generation: number;
  controller: AbortController;
  promise: Promise<PlaybackPlan>;
  foregroundConsumers: number;
  backgroundConsumers: number;
  foregroundConsumerAttached: boolean;
  keepAlive: boolean;
};

const playbackPlanCache = new Map<string, CachedPlaybackPlan>();
const inFlightPlaybackPlans = new Map<string, InFlightPlaybackPlan>();
const playbackPlanGenerations = new Map<string, number>();
let bridgeDetectionInFlight: Promise<boolean> | null = null;

function applyLocalPlaybackPreferences(
  deviceProfile: DeviceProfile,
  action: PlaybackAction,
  allowedQualities: DeviceProfile["maxQuality"][] | undefined,
): DeviceProfile {
  if (action !== "play" || !allowedQualities) {
    return deviceProfile;
  }

  return {
    ...deviceProfile,
    maxQuality: allowedQualities[0] ?? deviceProfile.maxQuality,
  };
}

function getAllowedPlaybackQualities() {
  return normalizePreferredQualities(
    usePlayerStore.getState().preferredQualities,
  );
}

function buildPlannerPreferences(
  preferredAudioLanguage?: string | null,
  preferredSubtitleLanguage?: string | null,
  allowedQualities?: DeviceProfile["maxQuality"][],
): PlaybackPlanRequest["preferences"] | undefined {
  const preferences: NonNullable<PlaybackPlanRequest["preferences"]> = {};

  if (preferredAudioLanguage) {
    preferences.preferredAudioLanguage = preferredAudioLanguage;
  }

  if (preferredSubtitleLanguage) {
    preferences.preferredSubtitleLanguage = preferredSubtitleLanguage;
  }

  if (allowedQualities) {
    preferences.allowedQualities = allowedQualities;
  }

  return Object.keys(preferences).length > 0 ? preferences : undefined;
}

function preparePlaybackPlanRequest(
  input: PlaybackPlanInput,
): PreparedPlaybackPlanRequest {
  const { deviceProfile: requestedDeviceProfile, ...request } = input;
  const baseDeviceProfile =
    requestedDeviceProfile ??
    (input.action === "cast"
      ? getChromecastDeviceProfile()
      : getDeviceProfile());
  const allowedQualities =
    input.action === "play" ? getAllowedPlaybackQualities() : undefined;
  const deviceProfile = applyLocalPlaybackPreferences(
    baseDeviceProfile,
    input.action,
    allowedQualities,
  );
  const { preferredAudioLang, preferredSubtitleLang } =
    usePlayerStore.getState();
  const preferences = buildPlannerPreferences(
    preferredAudioLang,
    preferredSubtitleLang,
    allowedQualities,
  );
  // Cast compatibility uses the display profile, but bridge reachability is
  // always evaluated from the controller running this client.
  const bridge = buildActionBridgeHint({ deviceProfile: getDeviceProfile() });

  const payload: PlaybackPlanRequest = {
    ...request,
    deviceProfile,
    ...(preferences ? { preferences } : {}),
    bridge,
  };

  // Do not include bridge URLs or source data in this key. This is purely an
  // in-memory routing key for the current account and planner constraints.
  const cacheKey = JSON.stringify({
    userId: useAuthStore.getState().user?.id ?? "anonymous",
    type: payload.type,
    id: payload.id,
    season: payload.season,
    episode: payload.episode,
    action: payload.action,
    deviceProfile: payload.deviceProfile,
    preferences: payload.preferences,
    bridge: payload.bridge
      ? {
          status: payload.bridge.status,
          reason: payload.bridge.reason,
          configured: payload.bridge.configured,
          endpointScope: payload.bridge.endpoint?.scope,
        }
      : undefined,
  });

  return { payload, cacheKey };
}

async function requestPlaybackPlan(
  payload: PlaybackPlanRequest,
  signal?: AbortSignal,
): Promise<PlaybackPlan> {
  const response = signal
    ? await api.post<PlaybackPlan>("/api/playback/plan", payload, { signal })
    : await api.post<PlaybackPlan>("/api/playback/plan", payload);

  return playbackPlanSchema.parse(response.data);
}

function createAbortError() {
  const error = new Error("Playback planning was cancelled.");
  error.name = "AbortError";
  return error;
}

export function isPlaybackPlanAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };
  return (
    candidate.name === "AbortError" ||
    candidate.name === "CanceledError" ||
    candidate.code === "ERR_CANCELED" ||
    (typeof candidate.message === "string" &&
      /(?:abort|cancel)/i.test(candidate.message))
  );
}

function pruneExpiredPlaybackPlans(now = Date.now()) {
  for (const [key, entry] of playbackPlanCache.entries()) {
    if (entry.expiresAt <= now) playbackPlanCache.delete(key);
  }
}

function attachPlaybackPlanConsumer(
  requestKey: string,
  entry: InFlightPlaybackPlan,
  options: PlaybackPlanRequestOptions,
): Promise<PlaybackPlan> {
  const { signal } = options;
  const isPrefetch = options.consumer === "prefetch";

  // A no-signal foreground caller (for example More Sources) is a deliberate
  // owner of this work. A no-signal prefetch is not: it merely warms the cache
  // and must not prevent an Escape/Cancel from stopping the Play request.
  if (!signal) {
    if (!isPrefetch) entry.keepAlive = true;
    return entry.promise;
  }

  if (signal.aborted) return Promise.reject(createAbortError());

  if (isPrefetch) {
    entry.backgroundConsumers += 1;
  } else {
    entry.foregroundConsumers += 1;
    entry.foregroundConsumerAttached = true;
  }

  return new Promise<PlaybackPlan>((resolve, reject) => {
    let settled = false;

    const release = (aborted: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (isPrefetch) {
        entry.backgroundConsumers = Math.max(0, entry.backgroundConsumers - 1);
      } else {
        entry.foregroundConsumers = Math.max(0, entry.foregroundConsumers - 1);
      }

      const hasNoInteractiveConsumer = entry.foregroundConsumers === 0;
      const hasNoConsumer =
        hasNoInteractiveConsumer && entry.backgroundConsumers === 0;
      if (
        aborted &&
        !entry.keepAlive &&
        inFlightPlaybackPlans.get(requestKey) === entry &&
        // Once a viewer attached to a prefetched request, that viewer owns
        // cancellation. Do not leave a background warm-up running after they
        // explicitly leave the player.
        (entry.foregroundConsumerAttached
          ? hasNoInteractiveConsumer
          : hasNoConsumer)
      ) {
        entry.controller.abort();
      }
    };

    const onAbort = () => {
      release(true);
      reject(createAbortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });
    entry.promise.then(
      (plan) => {
        release(false);
        resolve(plan);
      },
      (error) => {
        release(false);
        reject(error);
      },
    );
  });
}

/**
 * A public, transient plan helper used by every Play-facing surface. It is
 * deliberately not persisted: plans can include runtime stream metadata.
 */
export function getPlaybackPlan(
  input: PlaybackPlanInput,
  options: PlaybackPlanRequestOptions = {},
): Promise<PlaybackPlan> {
  if (options.signal?.aborted) return Promise.reject(createAbortError());

  pruneExpiredPlaybackPlans();
  const prepared = preparePlaybackPlanRequest(input);
  if (options.forceRefresh) playbackPlanCache.delete(prepared.cacheKey);

  const cached = playbackPlanCache.get(prepared.cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.plan);
  }

  // An explicit retry must never attach to the original partial fan-out. It
  // uses one separate forced request, while ordinary callers that arrive
  // afterwards join that newer request rather than reusing stale work.
  const forcedRequestKey = `${prepared.cacheKey}${FORCE_REFRESH_KEY_SUFFIX}`;
  const requestKey = options.forceRefresh
    ? forcedRequestKey
    : inFlightPlaybackPlans.has(forcedRequestKey)
      ? forcedRequestKey
      : prepared.cacheKey;
  let entry = inFlightPlaybackPlans.get(requestKey);
  if (!entry) {
    const controller = new AbortController();
    const generation =
      (playbackPlanGenerations.get(prepared.cacheKey) ?? 0) + 1;
    playbackPlanGenerations.set(prepared.cacheKey, generation);
    const createdEntry: InFlightPlaybackPlan = {
      cacheKey: prepared.cacheKey,
      generation,
      controller,
      foregroundConsumers: 0,
      backgroundConsumers: 0,
      foregroundConsumerAttached: false,
      keepAlive: false,
      promise: Promise.resolve(undefined as never),
    };
    createdEntry.promise = requestPlaybackPlan(
      prepared.payload,
      controller.signal,
    )
      .then((plan) => {
        // A partial plan intentionally expires almost immediately. The server
        // keeps discovering in the background, so a retry can consume the
        // warmed complete result without the client holding stale candidates.
        if (
          playbackPlanGenerations.get(createdEntry.cacheKey) ===
          createdEntry.generation
        ) {
          playbackPlanCache.set(createdEntry.cacheKey, {
            plan,
            expiresAt:
              Date.now() +
              (plan.sourceDiscovery?.status === "partial"
                ? PARTIAL_PLAYBACK_PLAN_CACHE_TTL_MS
                : PLAYBACK_PLAN_CACHE_TTL_MS),
          });
        }
        return plan;
      })
      .finally(() => {
        if (inFlightPlaybackPlans.get(requestKey) === createdEntry) {
          inFlightPlaybackPlans.delete(requestKey);
        }
      });
    inFlightPlaybackPlans.set(requestKey, createdEntry);
    entry = createdEntry;
  }

  return attachPlaybackPlanConsumer(requestKey, entry, options);
}

/** Start a bridge probe once while the plan request is in flight. */
export function detectPlaybackBridgeOnce(): Promise<boolean> {
  // Do not turn a confirmed bridge back into a transient `loading` state just
  // because a direct plan is being requested. In particular, Cast resolves
  // its source immediately after planning and correctly treats that state as
  // a bridge-not-ready failure.
  if (streamEngineManager.bridgeAvailable) {
    return Promise.resolve(true);
  }

  if (!bridgeDetectionInFlight) {
    bridgeDetectionInFlight = streamEngineManager
      .detectBridge()
      .catch(() => false)
      .finally(() => {
        bridgeDetectionInFlight = null;
      });
  }
  return bridgeDetectionInFlight;
}

export async function createPlaybackPlan(
  input: PlaybackPlanInput,
  options: Pick<PlaybackPlanRequestOptions, "signal"> = {},
): Promise<PlaybackPlan> {
  if (options.signal?.aborted) throw createAbortError();
  const { payload } = preparePlaybackPlanRequest(input);
  return requestPlaybackPlan(payload, options.signal);
}

/**
 * Cached planner lookup with a single-flight bridge retry. This is the
 * canonical public entrypoint for Play, More Sources and Source Inspector.
 */
export async function getPlaybackPlanWithBridgeRetry(
  input: PlaybackPlanInput,
  options: PlaybackPlanRequestOptions = {},
): Promise<PlaybackPlan> {
  const bridgeDetection = detectPlaybackBridgeOnce();
  const plan = await getPlaybackPlan(input, options);
  if (plan.state !== "needsBridge") return plan;

  if (options.signal?.aborted) throw createAbortError();
  const bridgeAvailable = await awaitWithAbort(bridgeDetection, options.signal);
  if (!bridgeAvailable) return plan;

  // Bridge state is part of the cache key. A forced request also avoids
  // replaying an earlier needs-bridge response when diagnostics did not change.
  return getPlaybackPlan(input, { ...options, forceRefresh: true });
}

/**
 * A partial fast plan can be returned while the server still waits for late
 * providers. Poll its short-lived cache a few times rather than treating an
 * identical partial answer as a new source choice. This stays bounded and is
 * only used after the first partial plan has exhausted every candidate.
 */
export async function getPlaybackPlanAfterPartialDiscovery(
  input: PlaybackPlanInput,
  options: PlaybackPlanRequestOptions = {},
): Promise<PlaybackPlan> {
  let plan = await getPlaybackPlanWithBridgeRetry(input, {
    ...options,
    forceRefresh: true,
  });
  if (plan.sourceDiscovery?.status !== "partial") return plan;

  for (const delayMs of PARTIAL_DISCOVERY_RETRY_DELAYS_MS) {
    await delayWithAbort(delayMs, options.signal);
    plan = await getPlaybackPlanWithBridgeRetry(input, {
      ...options,
      forceRefresh: true,
    });
    if (plan.sourceDiscovery?.status !== "partial") return plan;
  }

  return plan;
}

/** Backwards-compatible name for existing callers. */
export function createPlaybackPlanWithBridgeRetry(
  input: PlaybackPlanInput,
  options: PlaybackPlanRequestOptions = {},
): Promise<PlaybackPlan> {
  return getPlaybackPlanWithBridgeRetry(input, options);
}

/** Warm the same cache Detail's primary Play action will consume. */
export function prefetchPlaybackPlan(
  input: PlaybackPlanInput,
  signal?: AbortSignal,
) {
  return getPlaybackPlanWithBridgeRetry(input, {
    signal,
    consumer: "prefetch",
  }).catch(() => null);
}

/**
 * Add-on/account surfaces call this after a source-affecting mutation. Cache
 * contents are runtime-only and can safely be discarded immediately.
 */
export function invalidatePlaybackPlanCache() {
  playbackPlanCache.clear();
  playbackPlanGenerations.clear();
  for (const entry of inFlightPlaybackPlans.values()) {
    entry.controller.abort();
  }
  inFlightPlaybackPlans.clear();
}

export function resetPlaybackPlanCacheForTests() {
  invalidatePlaybackPlanCache();
  bridgeDetectionInFlight = null;
}

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function delayWithAbort(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(createAbortError());
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

let cachedPlanUserId = useAuthStore.getState().user?.id ?? null;
let cachedPlanBridgeUrl = useAuthStore.getState().streamServerUrl;

// Authentication and bridge configuration are outside the planner input
// lifecycle. Clear transient entries when either scope changes so a new
// account or source setup never inherits another context's plan.
useAuthStore.subscribe((state) => {
  const nextUserId = state.user?.id ?? null;
  if (
    nextUserId !== cachedPlanUserId ||
    state.streamServerUrl !== cachedPlanBridgeUrl
  ) {
    cachedPlanUserId = nextUserId;
    cachedPlanBridgeUrl = state.streamServerUrl;
    invalidatePlaybackPlanCache();
  }
});

export interface ResolvedPlaybackPlanStream {
  stream: Stream;
  uri: string;
  attemptedStreams: number;
  errors: string[];
}

export interface PlaybackPlanResolveResult {
  resolved: ResolvedPlaybackPlanStream | null;
  attemptedStreams: number;
  errors: string[];
  remainingStreams: Stream[];
}

export function getReadyPlanStreams(plan: PlaybackPlan): Stream[] {
  if (plan.state !== "ready" || !plan.selectedCandidate) return [];

  const entries = [
    {
      candidate: plan.selectedCandidate,
      playbackUrl: plan.plan?.playbackUrl,
    },
    ...plan.fallbackCandidates.map((candidate) => ({
      candidate,
      playbackUrl: undefined,
    })),
  ];

  const seen = new Set<string>();
  const streams: Stream[] = [];

  for (const entry of entries) {
    const stream = entry.playbackUrl
      ? { ...entry.candidate.stream, url: entry.playbackUrl }
      : entry.candidate.stream;
    const key =
      stream.infoHash || stream.url || stream.externalUrl || entry.candidate.id;

    if (seen.has(key)) continue;
    seen.add(key);
    streams.push(stream);
  }

  return streams;
}

export async function resolvePlaybackPlan(
  plan: PlaybackPlan,
): Promise<PlaybackPlanResolveResult> {
  const streams = getReadyPlanStreams(plan);
  const errors: string[] = [];
  let attemptedStreams = 0;

  for (const [index, stream] of streams.entries()) {
    attemptedStreams += 1;
    try {
      const uri = await streamEngineManager.getPlaybackUri(stream);
      if (uri && uri.length > 0) {
        const resolvedStream =
          stream.url === uri ? stream : { ...stream, url: uri };

        return {
          resolved: {
            stream: resolvedStream,
            uri,
            attemptedStreams,
            errors,
          },
          attemptedStreams,
          errors,
          remainingStreams: streams.slice(index + 1),
        };
      }
      errors.push("Source did not return a playback URL");
    } catch (error: any) {
      errors.push(error?.message || String(error));
    }
  }

  return {
    resolved: null,
    attemptedStreams,
    errors,
    remainingStreams: [],
  };
}

export async function resolveFirstPlayablePlanStream(
  plan: PlaybackPlan,
): Promise<ResolvedPlaybackPlanStream | null> {
  const result = await resolvePlaybackPlan(plan);
  return result.resolved;
}

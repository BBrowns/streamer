import type {
  DeviceProfile,
  PlaybackAction,
  PlaybackPlan,
  PlaybackPlanRequest,
  Stream,
} from "@streamer/shared";
import { playbackPlanSchema } from "@streamer/shared";
import { api } from "../api";
import {
  streamEngineManager,
  validateBridgeUrl,
} from "../streamEngine/StreamEngineManager";
import { usePlayerStore } from "../../stores/playerStore";
import { getChromecastDeviceProfile, getDeviceProfile } from "./deviceProfile";

function applyLocalPlaybackPreferences(
  deviceProfile: DeviceProfile,
  action: PlaybackAction,
): DeviceProfile {
  const { preferredQuality } = usePlayerStore.getState();

  if (action !== "play" || preferredQuality === "auto") {
    return deviceProfile;
  }

  return {
    ...deviceProfile,
    maxQuality: preferredQuality,
  };
}

function buildPlannerPreferences(
  preferredAudioLanguage?: string | null,
  preferredSubtitleLanguage?: string | null,
): PlaybackPlanRequest["preferences"] | undefined {
  const preferences: NonNullable<PlaybackPlanRequest["preferences"]> = {};

  if (preferredAudioLanguage) {
    preferences.preferredAudioLanguage = preferredAudioLanguage;
  }

  if (preferredSubtitleLanguage) {
    preferences.preferredSubtitleLanguage = preferredSubtitleLanguage;
  }

  return Object.keys(preferences).length > 0 ? preferences : undefined;
}

function buildBridgeHint(
  diagnostics: ReturnType<typeof streamEngineManager.getBridgeDiagnostics>,
): PlaybackPlanRequest["bridge"] {
  const bridge: NonNullable<PlaybackPlanRequest["bridge"]> = {
    status: diagnostics.status || streamEngineManager.bridgeStatus,
  };

  const bridgeUrl = diagnostics.url || streamEngineManager.getBridgeUrl();
  const bridgeUrlValidation = validateBridgeUrl(bridgeUrl);
  if (bridgeUrlValidation.ok && bridgeUrlValidation.url) {
    bridge.url = bridgeUrlValidation.url;
  }

  const reason = diagnostics.reason || diagnostics.message;
  if (reason) {
    bridge.reason = reason;
  }

  return bridge;
}

export async function createPlaybackPlan(
  input: Pick<PlaybackPlanRequest, "type" | "id" | "season" | "episode"> & {
    action: PlaybackAction;
    deviceProfile?: DeviceProfile;
  },
): Promise<PlaybackPlan> {
  const { deviceProfile: requestedDeviceProfile, ...request } = input;
  const baseDeviceProfile =
    requestedDeviceProfile ??
    (input.action === "cast"
      ? getChromecastDeviceProfile()
      : getDeviceProfile());
  const deviceProfile = applyLocalPlaybackPreferences(
    baseDeviceProfile,
    input.action,
  );
  const { preferredAudioLang, preferredSubtitleLang } =
    usePlayerStore.getState();
  const bridgeDiagnostics = streamEngineManager.getBridgeDiagnostics();
  const preferences = buildPlannerPreferences(
    preferredAudioLang,
    preferredSubtitleLang,
  );
  const bridge = buildBridgeHint(bridgeDiagnostics);

  const payload: PlaybackPlanRequest = {
    ...request,
    deviceProfile,
    ...(preferences ? { preferences } : {}),
    bridge,
  };

  const { data } = await api.post<PlaybackPlan>("/api/playback/plan", payload);

  return playbackPlanSchema.parse(data);
}

export async function createPlaybackPlanWithBridgeRetry(
  input: Pick<PlaybackPlanRequest, "type" | "id" | "season" | "episode"> & {
    action: PlaybackAction;
    deviceProfile?: DeviceProfile;
  },
): Promise<PlaybackPlan> {
  const plan = await createPlaybackPlan(input);
  if (plan.state !== "needsBridge") return plan;

  const bridgeAvailable = await streamEngineManager.detectBridge();
  if (!bridgeAvailable) return plan;

  return createPlaybackPlan(input);
}

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

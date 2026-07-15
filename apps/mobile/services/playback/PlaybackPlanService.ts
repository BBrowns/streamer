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
import { getChromecastDeviceProfile, getDeviceProfile } from "./deviceProfile";
import { buildActionBridgeHint } from "../actionPreflight";

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

import type {
  PlaybackAction,
  PlaybackPlan,
  PlaybackPlanRequest,
  Stream,
} from "@streamer/shared";
import { api } from "../api";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";
import { getChromecastDeviceProfile, getDeviceProfile } from "./deviceProfile";

export async function createPlaybackPlan(
  input: Pick<PlaybackPlanRequest, "type" | "id" | "season" | "episode"> & {
    action: PlaybackAction;
  },
): Promise<PlaybackPlan> {
  const deviceProfile =
    input.action === "cast" ? getChromecastDeviceProfile() : getDeviceProfile();
  const bridgeDiagnostics = streamEngineManager.getBridgeDiagnostics();

  const { data } = await api.post<PlaybackPlan>("/api/playback/plan", {
    ...input,
    deviceProfile,
    bridge: {
      status: streamEngineManager.bridgeStatus,
      url: streamEngineManager.getBridgeUrl(),
      reason: bridgeDiagnostics.reason || bridgeDiagnostics.message,
    },
  });

  return data;
}

export async function createPlaybackPlanWithBridgeRetry(
  input: Pick<PlaybackPlanRequest, "type" | "id" | "season" | "episode"> & {
    action: PlaybackAction;
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

export function getReadyPlanStreams(plan: PlaybackPlan): Stream[] {
  if (plan.state !== "ready" || !plan.plan?.selectedCandidate) return [];

  const entries = [
    {
      candidate: plan.plan.selectedCandidate,
      playbackUrl: plan.plan.playbackUrl,
    },
    ...(plan.plan.fallbackCandidates || []).map((candidate) => ({
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

export async function resolveFirstPlayablePlanStream(
  plan: PlaybackPlan,
): Promise<ResolvedPlaybackPlanStream | null> {
  const streams = getReadyPlanStreams(plan);
  const errors: string[] = [];

  for (const stream of streams) {
    try {
      const uri = await streamEngineManager.getPlaybackUri(stream);
      if (uri && uri.length > 0) {
        return {
          stream: stream.url === uri ? stream : { ...stream, url: uri },
          uri,
          attemptedStreams: errors.length + 1,
          errors,
        };
      }
      errors.push("Source did not return a playback URL");
    } catch (error: any) {
      errors.push(error?.message || String(error));
    }
  }

  return null;
}

import type {
  PlaybackAction,
  PlaybackPlan,
  PlaybackPlanRequest,
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

  const { data } = await api.post<PlaybackPlan>("/api/playback/plan", {
    ...input,
    deviceProfile,
    bridge: {
      status: streamEngineManager.bridgeStatus,
      url: streamEngineManager.getBridgeUrl(),
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

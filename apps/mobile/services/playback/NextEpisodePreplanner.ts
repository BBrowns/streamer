import type { PlaybackOrchestratorInput } from "./PlaybackOrchestrator";
import { createPlaybackPlanWithBridgeRetry } from "./PlaybackPlanService";

const NEXT_EPISODE_PREPLAN_TIMEOUT_MS = 8_000;

export async function preplanNextEpisode(
  input: PlaybackOrchestratorInput,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromParent, { once: true });
  if (signal?.aborted) abortFromParent();
  const timer = setTimeout(
    () => controller.abort(new Error("Next episode pre-plan timed out")),
    NEXT_EPISODE_PREPLAN_TIMEOUT_MS,
  );

  try {
    const plan = await createPlaybackPlanWithBridgeRetry(
      {
        type: input.type,
        id: input.id,
        season: input.season,
        episode: input.episode,
        action: "play",
      },
      { signal: controller.signal },
    );
    return {
      state: plan.state,
      safeImmediateReplacement:
        plan.state === "ready" &&
        (plan.selectedCandidate?.kind === "direct" ||
          plan.selectedCandidate?.kind === "hls"),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

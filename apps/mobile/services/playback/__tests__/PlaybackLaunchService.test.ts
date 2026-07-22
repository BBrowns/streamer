import * as Crypto from "expo-crypto";
import { usePlaybackSessionStore } from "../../../stores/playbackSessionStore";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../../test-utils/playbackPlan";
import {
  beginPlaybackLaunch,
  cancelPlaybackLaunch,
  getPlaybackLaunch,
  releasePlaybackLaunch,
  resetPlaybackLaunchesForTests,
} from "../PlaybackLaunchService";
import {
  playBest,
  type PlaybackOrchestratorSuccess,
} from "../PlaybackOrchestrator";
import { cancelPlaybackSession } from "../PlaybackSessionPlaybackService";

jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));
jest.mock("../PlaybackOrchestrator", () => ({ playBest: jest.fn() }));
jest.mock("../PlaybackSessionPlaybackService", () => ({
  cancelPlaybackSession: jest.fn(),
}));

describe("PlaybackLaunchService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlaybackLaunchesForTests();
    jest
      .mocked(Crypto.randomUUID)
      .mockReturnValue(
        "00000000-0000-4000-8000-000000000901" as `${string}-${string}-${string}-${string}-${string}`,
      );
  });

  afterEach(() => {
    resetPlaybackLaunchesForTests();
    jest.restoreAllMocks();
  });

  it("aborts the foreground plan and cleans a result that arrives after Cancel", async () => {
    let resolvePlan!: (value: PlaybackOrchestratorSuccess) => void;
    jest.mocked(playBest).mockImplementation(
      () =>
        new Promise<PlaybackOrchestratorSuccess>((resolve) => {
          resolvePlan = resolve;
        }),
    );
    const removeSession = jest.spyOn(
      usePlaybackSessionStore.getState(),
      "removeSession",
    );
    const candidate = makePlannedMediaCandidate();
    const result: PlaybackOrchestratorSuccess = {
      ok: true,
      stream: candidate.stream,
      mediaInfo: { type: "movie", itemId: "tt-launch", title: "Launch" },
      sessionId: "session-late-result",
      candidateId: "candidate-late-result",
      runtimeState: "selecting_source",
      plan: makePlaybackPlan({
        state: "ready",
        plan: {
          mode: "direct",
          selectedCandidate: candidate,
          fallbackCandidates: [],
        },
      }),
      attemptedStreams: 0,
      resolveErrors: [],
    };

    const launchId = beginPlaybackLaunch({ type: "movie", id: "tt-launch" });
    const foregroundSignal = jest.mocked(playBest).mock.calls[0][1]?.signal;
    expect(getPlaybackLaunch(launchId)).not.toBeNull();

    expect(cancelPlaybackLaunch(launchId, "Viewer cancelled.")).toBe(true);
    expect(foregroundSignal?.aborted).toBe(true);
    resolvePlan(result);
    await Promise.resolve();
    await Promise.resolve();

    expect(cancelPlaybackSession).toHaveBeenCalledWith(
      "session-late-result",
      "Playback launch was cancelled.",
    );
    expect(removeSession).toHaveBeenCalledWith("session-late-result");
    expect(getPlaybackLaunch(launchId)).toBeNull();
  });

  it("clears its expiry timer once the player takes ownership", () => {
    jest.useFakeTimers();
    jest.mocked(playBest).mockResolvedValue({
      ok: false,
      error: {
        code: "SOURCE_UNAVAILABLE",
        message: "No source",
        retryable: true,
        shouldFallback: false,
      },
      runtimeState: "failed_unknown",
      attemptedStreams: 0,
      resolveErrors: [],
    });

    const launchId = beginPlaybackLaunch({ type: "movie", id: "tt-owned" });
    expect(jest.getTimerCount()).toBe(1);

    releasePlaybackLaunch(launchId);

    expect(jest.getTimerCount()).toBe(0);
    expect(getPlaybackLaunch(launchId)).toBeNull();
  });
});

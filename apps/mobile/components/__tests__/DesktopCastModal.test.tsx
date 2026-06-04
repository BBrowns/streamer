import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { DesktopCastModal } from "../DesktopCastModal";
import { castService } from "../../services/CastService";
import { prepareCast } from "../../services/playback/PlaybackOrchestrator";
import { startCastSession } from "../../services/playback/PlaybackSessionCastService";
import { cancelPlaybackSession } from "../../services/playback/PlaybackSessionPlaybackService";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../test-utils/playbackPlan";

jest.mock("@expo/vector-icons", () => ({
  MaterialIcons: () => null,
}));

jest.mock("../../services/CastService", () => ({
  castService: {
    getDevices: jest.fn(),
    play: jest.fn(),
  },
}));

jest.mock("../../services/playback/PlaybackOrchestrator", () => ({
  prepareCast: jest.fn(),
}));

jest.mock("../../services/playback/PlaybackSessionCastService", () => ({
  getCastContentType: jest.fn(() => "video/mp4"),
  startCastSession: jest.fn(),
}));

jest.mock("../../services/playback/PlaybackSessionPlaybackService", () => ({
  cancelPlaybackSession: jest.fn(),
}));

describe("DesktopCastModal", () => {
  const getDevices = castService.getDevices as jest.MockedFunction<
    typeof castService.getDevices
  >;
  const play = castService.play as jest.MockedFunction<typeof castService.play>;
  const prepare = prepareCast as jest.MockedFunction<typeof prepareCast>;
  const start = startCastSession as jest.MockedFunction<
    typeof startCastSession
  >;

  const preparedCast = {
    ok: true as const,
    stream: { url: "https://cdn.example.test/movie.mp4" },
    resolvedUrl: "https://cdn.example.test/movie.mp4",
    mediaInfo: {
      type: "movie" as const,
      itemId: "tt123",
      title: "Example Movie",
    },
    sessionId: "session-1",
    candidateId: "candidate-1",
    attemptId: "attempt-1",
    runtimeState: "selecting_source" as const,
    plan: makePlaybackPlan({
      action: "cast",
      state: "ready",
      plan: {
        mode: "direct",
        selectedCandidate: makePlannedMediaCandidate({
          id: "00000000-0000-4000-8000-000000000101",
          kind: "direct",
          stream: { url: "https://cdn.example.test/movie.mp4" },
          actionEligibility: { action: "cast", eligible: true },
        }),
      },
    }),
    attemptedStreams: 1,
    resolveErrors: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getDevices.mockResolvedValue([
      { id: "living-room", name: "Living Room", type: "chromecast" },
    ]);
    play.mockResolvedValue(undefined);
    prepare.mockResolvedValue(preparedCast);
    start.mockResolvedValue({
      ok: true,
      sessionId: "session-1",
      candidateId: "candidate-1",
      attemptId: "attempt-1",
      stream: preparedCast.stream,
      uri: preparedCast.resolvedUrl,
    });
  });

  it("prepares a cast session before enabling device selection", async () => {
    const onCastStart = jest.fn();

    const screen = render(
      <DesktopCastModal
        visible
        playbackUri="http://bridge.test/api/gateway/jobs/current/stream"
        title="Example Movie"
        orchestratorInput={{
          type: "movie",
          id: "tt123",
          title: "Example Movie",
        }}
        onClose={jest.fn()}
        onCastStart={onCastStart}
      />,
    );

    await waitFor(() => {
      expect(prepare).toHaveBeenCalledWith(
        {
          type: "movie",
          id: "tt123",
          title: "Example Movie",
        },
        expect.objectContaining({
          deviceProfile: expect.objectContaining({ platform: "chromecast" }),
          castProfile: expect.objectContaining({
            requiresRemoteReachableUrl: true,
          }),
        }),
      );
      expect(screen.getByText("Source ready. Choose a display.")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Living Room"));

    await waitFor(() => {
      expect(start).toHaveBeenCalledWith(
        { id: "living-room", name: "Living Room", type: "chromecast" },
        "Example Movie",
        {
          sessionId: "session-1",
          candidateId: "candidate-1",
          attemptId: "attempt-1",
          stream: preparedCast.stream,
          uri: preparedCast.resolvedUrl,
        },
      );
    });
    expect(play).not.toHaveBeenCalled();
    expect(onCastStart).toHaveBeenCalledWith(
      { id: "living-room", name: "Living Room", type: "chromecast" },
      expect.objectContaining({ sessionId: "session-1" }),
    );
  });

  it("shows cast preparation failures inline and keeps devices disabled", async () => {
    prepare.mockResolvedValueOnce({
      ok: false,
      sessionId: "session-1",
      error: {
        code: "BRIDGE_UNAVAILABLE",
        message: "Connect this device to the desktop bridge.",
        retryable: true,
        shouldFallback: false,
      },
      runtimeState: "failed_bridge_unavailable",
      plan: makePlaybackPlan({
        action: "cast",
        state: "needsBridge",
      }),
      attemptedStreams: 0,
      resolveErrors: [],
    });

    const screen = render(
      <DesktopCastModal
        visible
        title="Example Movie"
        orchestratorInput={{
          type: "movie",
          id: "tt123",
          title: "Example Movie",
        }}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Connect this device to the desktop bridge."),
      ).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Living Room"));
    expect(start).not.toHaveBeenCalled();
  });

  it("shows unexpected preparation errors inline", async () => {
    prepare.mockRejectedValueOnce(new Error("Playback planner unavailable"));

    const screen = render(
      <DesktopCastModal
        visible
        title="Example Movie"
        orchestratorInput={{
          type: "movie",
          id: "tt123",
          title: "Example Movie",
        }}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Playback planner unavailable")).toBeTruthy();
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("re-plans with explicit device capabilities after generic preparation fails", async () => {
    getDevices.mockResolvedValueOnce([
      {
        id: "living-room",
        name: "Living Room",
        type: "chromecast",
        capabilities: {
          supportsMp4: true,
          supportedCodecs: ["h265", "aac"],
        },
      },
    ]);
    prepare
      .mockResolvedValueOnce({
        ok: false,
        sessionId: "session-generic",
        error: {
          code: "UNSUPPORTED_CODEC",
          message: "No generic cast source is compatible.",
          retryable: false,
          shouldFallback: false,
        },
        runtimeState: "failed_unsupported_codec",
        plan: makePlaybackPlan({
          action: "cast",
          state: "unsupported",
        }),
        attemptedStreams: 0,
        resolveErrors: [],
      })
      .mockResolvedValueOnce(preparedCast);

    const screen = render(
      <DesktopCastModal
        visible
        title="Example Movie"
        orchestratorInput={{
          type: "movie",
          id: "tt123",
          title: "Example Movie",
        }}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("No generic cast source is compatible."),
      ).toBeTruthy();
    });
    fireEvent.press(screen.getByText("Living Room"));

    await waitFor(() => {
      expect(prepare).toHaveBeenNthCalledWith(
        2,
        {
          type: "movie",
          id: "tt123",
          title: "Example Movie",
        },
        expect.objectContaining({
          deviceProfile: expect.objectContaining({
            supports: expect.objectContaining({ h265: true }),
          }),
        }),
      );
      expect(start).toHaveBeenCalled();
    });
  });

  it("keeps manual advanced-source casting available without creating a session", async () => {
    const screen = render(
      <DesktopCastModal
        visible
        playbackUri="https://cdn.example.test/manual.mp4"
        title="Example Movie"
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Living Room")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("Living Room"));

    await waitFor(() => {
      expect(play).toHaveBeenCalledWith(
        "living-room",
        "https://cdn.example.test/manual.mp4",
        "Example Movie",
        "video/mp4",
      );
    });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("cancels a prepared session when the dialog closes before casting starts", async () => {
    const screen = render(
      <DesktopCastModal
        visible
        title="Example Movie"
        orchestratorInput={{
          type: "movie",
          id: "tt123",
          title: "Example Movie",
        }}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Source ready. Choose a display.")).toBeTruthy();
    });
    screen.unmount();

    expect(cancelPlaybackSession).toHaveBeenCalledWith(
      "session-1",
      "Cast dialog was closed.",
    );
  });
});

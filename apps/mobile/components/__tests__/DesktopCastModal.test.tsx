import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { DesktopCastModal } from "../DesktopCastModal";
import { castService } from "../../services/CastService";
import { prepareCast } from "../../services/playback/PlaybackOrchestrator";

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

describe("DesktopCastModal", () => {
  const getDevices = castService.getDevices as jest.MockedFunction<
    typeof castService.getDevices
  >;
  const play = castService.play as jest.MockedFunction<typeof castService.play>;
  const prepare = prepareCast as jest.MockedFunction<typeof prepareCast>;

  beforeEach(() => {
    jest.clearAllMocks();
    getDevices.mockResolvedValue([
      { id: "living-room", name: "Living Room", type: "chromecast" },
    ]);
    play.mockResolvedValue(undefined);
  });

  it("casts an existing playback URI without re-planning the active player stream", async () => {
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
      expect(screen.getByText("Living Room")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Living Room"));

    await waitFor(() => {
      expect(play).toHaveBeenCalledWith(
        "living-room",
        "http://bridge.test/api/gateway/jobs/current/stream",
        "Example Movie",
      );
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(onCastStart).toHaveBeenCalledWith({
      id: "living-room",
      name: "Living Room",
      type: "chromecast",
    });
  });

  it("uses the cast orchestrator when no playback URI is available", async () => {
    prepare.mockResolvedValue({
      ok: true,
      stream: { url: "https://cdn.example.test/movie.mp4" },
      resolvedUrl: "https://cdn.example.test/movie.mp4",
      mediaInfo: {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
      },
      runtimeState: "buffering",
      plan: {
        state: "ready",
        plan: {
          mode: "direct",
          selectedCandidate: {
            id: "direct",
            kind: "direct",
            stream: { url: "https://cdn.example.test/movie.mp4" },
            riskFlags: [],
          },
        },
      },
      attemptedStreams: 1,
      resolveErrors: [],
    });

    const screen = render(
      <DesktopCastModal
        visible
        playbackUri=""
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
      expect(screen.getByText("Living Room")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Living Room"));

    await waitFor(() => {
      expect(prepare).toHaveBeenCalledWith({
        type: "movie",
        id: "tt123",
        title: "Example Movie",
      });
      expect(play).toHaveBeenCalledWith(
        "living-room",
        "https://cdn.example.test/movie.mp4",
        "Example Movie",
      );
    });
  });
});

import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import type { PlaybackSession } from "@streamer/shared";
import { PlayerStatusOverlay } from "../PlayerStatusOverlay";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      tint: "#a78bfa",
      error: "#ff9ba6",
      success: "#a7e8bd",
      warning: "#ffd9a8",
      card: "rgba(255,255,255,0.08)",
      text: "#ffffff",
      textSecondary: "#c7bfd5",
      border: "rgba(255,255,255,0.16)",
    },
  }),
}));

describe("PlayerStatusOverlay", () => {
  const sessionBase: PlaybackSession = {
    schemaVersion: 1,
    id: "00000000-0000-4000-8000-000000000001",
    action: "play",
    status: "finding_peers",
    content: { type: "movie", id: "tt123" },
    candidates: [],
    attempts: [],
    deviceProfile: {
      platform: "web",
      maxQuality: "1080p",
      network: "local",
      supports: {
        h264: true,
        h265: false,
        av1: false,
        mp4: true,
        mkv: false,
        hls: true,
        dolbyVision: false,
        aac: true,
        ac3: false,
        eac3: false,
      },
    },
    timeoutBudgetMs: 120_000,
    eventLog: [],
    createdAt: "2026-06-04T10:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
  };

  it("shows fallback reason while trying another planned source", () => {
    const screen = render(
      <PlayerStatusOverlay
        streamState="loading_metrics"
        runtimeState="trying_fallback"
        streamMetrics={null}
        isBuffering
        errorMessage={null}
        fallbackReason="Trying another source automatically."
        onBack={jest.fn()}
      />,
    );

    expect(screen.getAllByText("player.status.tryingFallback").length).toBe(2);
    expect(
      screen.getByText("Trying another source automatically."),
    ).toBeTruthy();
  });

  it("offers retry and Sources & Devices actions on playback errors", () => {
    const onRetry = jest.fn();
    const onOpenSourcesDevices = jest.fn();
    const onBack = jest.fn();

    const screen = render(
      <PlayerStatusOverlay
        streamState="error"
        streamMetrics={null}
        isBuffering={false}
        errorMessage="The desktop bridge is not ready."
        onBack={onBack}
        onRetry={onRetry}
        onOpenSourcesDevices={onOpenSourcesDevices}
      />,
    );

    fireEvent.press(screen.getByText("common.retry"));
    fireEvent.press(screen.getByText("player.errors.openSourcesDevices"));
    fireEvent.press(screen.getByText("player.errors.goBack"));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onOpenSourcesDevices).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("uses runtime error titles and hides retry when retry is not useful", () => {
    const screen = render(
      <PlayerStatusOverlay
        streamState="error"
        streamMetrics={null}
        isBuffering={false}
        errorMessage="Unsupported codec h265"
        runtimeError={{
          code: "UNSUPPORTED_CODEC",
          message: "Unsupported codec h265",
          retryable: false,
          shouldFallback: false,
        }}
        onBack={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByText("player.status.unsupportedTitle")).toBeTruthy();
    expect(screen.queryByText("common.retry")).toBeNull();
  });

  it("uses session readiness state and gateway progress for loading copy", () => {
    const session: PlaybackSession = {
      ...sessionBase,
      eventLog: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          sessionId: sessionBase.id,
          at: "2026-06-04T10:00:01.000Z",
          type: "gateway_progress",
          gatewayJobId: "gateway-job-1",
          phase: "finding_peers",
          progress: 0.25,
          peerCount: 2,
        },
      ],
    };
    const screen = render(
      <PlayerStatusOverlay
        streamState="loading_metrics"
        runtimeState="buffering"
        streamMetrics={null}
        isBuffering
        errorMessage={null}
        session={session}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByText("player.status.findingPeers")).toBeTruthy();
    expect(screen.getByText("2 player.controls.peers • 25%")).toBeTruthy();
  });

  it("uses a terminal session error instead of a generic player error", () => {
    const session: PlaybackSession = {
      ...sessionBase,
      status: "failed",
      terminalError: {
        code: "NO_PEERS",
        message: "No peers were available.",
        retryable: true,
        shouldFallback: false,
      },
    };
    const screen = render(
      <PlayerStatusOverlay
        streamState="loading_metrics"
        streamMetrics={null}
        isBuffering={false}
        errorMessage={null}
        session={session}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByText("player.status.noPeersTitle")).toBeTruthy();
    expect(screen.getByText("No peers were available.")).toBeTruthy();
  });
});

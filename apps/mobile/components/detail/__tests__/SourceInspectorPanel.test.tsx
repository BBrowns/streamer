import { render, waitFor } from "@testing-library/react-native";
import { SourceInspectorPanel } from "../SourceInspectorPanel";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../../test-utils/playbackPlan";
import { createPlaybackPlanWithBridgeRetry } from "../../../services/playback/PlaybackPlanService";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: "#fbf6f4",
      card: "rgba(255,255,255,0.72)",
      text: "#282236",
      textSecondary: "#6f657d",
      header: "#fff8f5",
      border: "rgba(106, 93, 125, 0.16)",
      tint: "#a78bfa",
      tabBar: "rgba(255, 250, 248, 0.94)",
      error: "#df6b7a",
      success: "#63b987",
      warning: "#d7a15f",
    },
  }),
}));

jest.mock("../../../stores/toastStore", () => ({
  useToastStore: (selector: any) => selector({ show: jest.fn() }),
}));

jest.mock("../../../services/playback/PlaybackPlanService", () => ({
  createPlaybackPlanWithBridgeRetry: jest.fn(),
}));

const mockedCreatePlan =
  createPlaybackPlanWithBridgeRetry as jest.MockedFunction<
    typeof createPlaybackPlanWithBridgeRetry
  >;

describe("SourceInspectorPanel", () => {
  beforeEach(() => {
    mockedCreatePlan.mockReset();
  });

  it("shows ranked source compatibility and action-specific eligibility", async () => {
    const candidate = makePlannedMediaCandidate({
      id: "00000000-0000-4000-8000-000000000021",
      rank: 0,
      score: 950,
      kind: "torrent",
      quality: "1080p",
      container: "mkv",
      videoCodec: "h265",
      seeders: 12,
      sizeBytes: 2_000_000_000,
      requiresBridge: true,
      requiresRemux: true,
      actionEligibility: {
        action: "play",
        eligible: true,
      },
      decisionReasons: ["bridge_source_selected", "remux_selected"],
    });
    mockedCreatePlan.mockResolvedValue(
      makePlaybackPlan({
        state: "ready",
        selectedCandidate: candidate,
        orderedCandidates: [candidate],
        rejectedCandidates: [
          {
            candidateId: "00000000-0000-4000-8000-000000000022",
            title: "Blocked source",
            reason: "Bridge unavailable",
            reasonCode: "bridge_unavailable",
            requiresBridge: true,
            requiresRemux: false,
            deviceCompatibility: candidate.deviceCompatibility,
            actionEligibility: {
              action: "play",
              eligible: false,
              reason: "bridge_unavailable",
            },
          },
        ],
      }),
    );

    const screen = render(
      <SourceInspectorPanel
        contentType="movie"
        contentId="tt123"
        title="Movie"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Play eligible")).toBeTruthy();
    });

    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("Selected")).toBeTruthy();
    expect(screen.getAllByText("Bridge").length).toBeGreaterThan(0);
    expect(screen.getByText("Remux")).toBeTruthy();
    expect(screen.getByText("Blocked source")).toBeTruthy();
    expect(screen.getByText("Play blocked")).toBeTruthy();
    expect(screen.getByText("Copy safe debug bundle")).toBeTruthy();
  });
});

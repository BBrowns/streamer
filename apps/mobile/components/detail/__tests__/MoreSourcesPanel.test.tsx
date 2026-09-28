import { fireEvent, render } from "@testing-library/react-native";
import { MoreSourcesPanel } from "../MoreSourcesPanel";

const mockUseSourceChoicePlan = jest.fn((..._args: unknown[]) => ({
  plan: null,
  choices: [{ candidateId: "1" }, { candidateId: "2" }, { candidateId: "3" }],
  loading: false,
  error: null,
  retry: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../lib/haptics", () => ({
  hapticImpactLight: jest.fn(),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      card: "#111318",
      surfaceElevated: "#181b21",
      text: "#f4f5f7",
      textSecondary: "#9da3ae",
      tint: "#6c79f5",
      focus: "#6c79f5",
    },
  }),
}));

jest.mock("../../../contexts/CinematicThemeContext", () => ({
  useCinematicTheme: () => ({ theme: { focus: "#C89B6D" } }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      const labels: Record<string, string> = {
        "detail.sources.more": "More Sources",
        "detail.sources.playbackSource": "Playback source",
        "detail.sources.show": "Show more sources",
        "detail.sources.hide": "Hide more sources",
        "detail.sources.showAll": "Show all sources",
        "detail.sources.bestAvailableLabel": "Best available",
        "detail.sources.technical": "Show technical details",
        "detail.sources.hideTechnical": "Hide technical details",
        "common.close": "Close",
      };
      if (key === "detail.sources.bestAvailable") {
        return `Best available · ${options?.count ?? 0} sources`;
      }
      return labels[key] ?? key;
    },
  }),
}));

jest.mock("../SourceChoiceList", () => ({
  useSourceChoicePlan: (...args: unknown[]) => mockUseSourceChoicePlan(...args),
  SourceChoiceList: ({ onSelect }: any) => {
    const { Pressable, Text } = require("react-native");
    return (
      <Pressable
        testID="source-choice-select"
        onPress={() => onSelect({} as any, "candidate-1")}
      >
        <Text>Consumer source choices</Text>
      </Pressable>
    );
  },
}));

jest.mock("../SourceInspectorPanel", () => ({
  SourceInspectorPanel: ({ contentType, contentId, season, episode }: any) => {
    const { Text } = require("react-native");
    return (
      <Text>{`Inspecting ${contentType}:${contentId}:${season}:${episode}`}</Text>
    );
  },
}));

jest.mock("../../ui/AdaptiveOverlay", () => ({
  AdaptiveOverlay: ({ visible, children }: any) => (visible ? children : null),
}));

describe("MoreSourcesPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a controlled player source chooser and closes with its close button", async () => {
    const onClose = jest.fn();
    const screen = await render(
      <MoreSourcesPanel
        contentId="series"
        contentType="series"
        title="Series"
        season={0}
        episode={2}
        visible
        showTrigger={false}
        onOpenChange={onClose}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.queryByText("Playback source")).toBeNull();
    expect(screen.getByText("Consumer source choices")).toBeTruthy();
    expect(mockUseSourceChoicePlan).toHaveBeenCalledWith({
      contentType: "series",
      contentId: "series",
      season: 0,
      episode: 2,
    });

    await fireEvent.press(screen.getByLabelText("Close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("plans lazily, then shows the eligible source count once", async () => {
    const screen = await render(
      <MoreSourcesPanel
        contentId="tt123"
        title="Example"
        sourceCount={77}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByText("Playback source")).toBeTruthy();
    expect(screen.getByText("Best available")).toBeTruthy();
    expect(screen.queryByText("3 available")).toBeNull();
    expect(mockUseSourceChoicePlan).not.toHaveBeenCalled();
    expect(screen.queryByText("Consumer source choices")).toBeNull();
    expect(screen.queryByText("Show technical details")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Show more sources"));

    expect(mockUseSourceChoicePlan).toHaveBeenCalled();
    expect(screen.getByText("Best available · 3 sources")).toBeTruthy();
    expect(screen.getByText("Consumer source choices")).toBeTruthy();
    expect(screen.getByText("Show technical details")).toBeTruthy();
    expect(screen.getByLabelText("Hide more sources")).toBeTruthy();
  });

  it("inspects the selected series episode, including season-zero specials", async () => {
    const screen = await render(
      <MoreSourcesPanel
        contentId="series"
        contentType="series"
        title="Series"
        season={0}
        episode={2}
        visible
        showTrigger={false}
        onSelect={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Show technical details"));

    expect(screen.getByText("Inspecting series:series:0:2")).toBeTruthy();
  });

  it("closes before handing a selected source to playback", async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <MoreSourcesPanel
        contentId="tt123"
        title="Example"
        initiallyOpen
        onSelect={onSelect}
      />,
    );

    await fireEvent.press(screen.getByTestId("source-choice-select"));

    expect(onSelect).toHaveBeenCalledWith({}, "candidate-1");
    expect(screen.queryByText("Consumer source choices")).toBeNull();
    expect(screen.queryByText("Show technical details")).toBeNull();
  });
});

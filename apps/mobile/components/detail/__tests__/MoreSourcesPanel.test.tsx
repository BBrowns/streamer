import { fireEvent, render } from "@testing-library/react-native";
import { MoreSourcesPanel } from "../MoreSourcesPanel";

const mockUseSourceChoicePlan = jest.fn(() => ({
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
      };
      if (key === "detail.sources.bestAvailable") {
        return `Best available · ${options?.count ?? 0} sources`;
      }
      return labels[key] ?? key;
    },
  }),
}));

jest.mock("../SourceChoiceList", () => ({
  useSourceChoicePlan: () => mockUseSourceChoicePlan(),
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

jest.mock("../TechnicalSourceDisclosure", () => ({
  TechnicalSourceDisclosure: () => {
    const { Text } = require("react-native");
    return <Text>Technical disclosure</Text>;
  },
}));

jest.mock("../../ui/AdaptiveOverlay", () => ({
  AdaptiveOverlay: ({ visible, children }: any) => (visible ? children : null),
}));

describe("MoreSourcesPanel", () => {
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
    expect(screen.queryByText("Technical disclosure")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Show more sources"));

    expect(mockUseSourceChoicePlan).toHaveBeenCalled();
    expect(screen.getByText("Best available · 3 sources")).toBeTruthy();
    expect(screen.getByText("Consumer source choices")).toBeTruthy();
    expect(screen.getByText("Technical disclosure")).toBeTruthy();
    expect(screen.getByLabelText("Hide more sources")).toBeTruthy();
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
    expect(screen.queryByText("Technical disclosure")).toBeNull();
  });
});

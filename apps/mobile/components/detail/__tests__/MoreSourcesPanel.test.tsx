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

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      const labels: Record<string, string> = {
        "detail.sources.more": "More Sources",
        "detail.sources.show": "Show more sources",
        "detail.sources.hide": "Hide more sources",
      };
      if (key === "detail.sources.available") {
        return `${options?.count ?? 0} available`;
      }
      return labels[key] ?? key;
    },
  }),
}));

jest.mock("../SourceChoiceList", () => ({
  useSourceChoicePlan: () => mockUseSourceChoicePlan(),
  SourceChoiceList: () => {
    const { Text } = require("react-native");
    return <Text>Consumer source choices</Text>;
  },
}));

jest.mock("../TechnicalSourceDisclosure", () => ({
  TechnicalSourceDisclosure: () => {
    const { Text } = require("react-native");
    return <Text>Technical disclosure</Text>;
  },
}));

describe("MoreSourcesPanel", () => {
  it("plans lazily, then shows the eligible source count once", () => {
    const screen = render(
      <MoreSourcesPanel
        contentId="tt123"
        title="Example"
        onSelect={jest.fn()}
      />,
    );

    expect(screen.queryByText("3 available")).toBeNull();
    expect(mockUseSourceChoicePlan).not.toHaveBeenCalled();
    expect(screen.queryByText("Consumer source choices")).toBeNull();
    expect(screen.queryByText("Technical disclosure")).toBeNull();

    fireEvent.press(screen.getByLabelText("Show more sources"));

    expect(mockUseSourceChoicePlan).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("3 available")).toHaveLength(1);
    expect(screen.getByText("Consumer source choices")).toBeTruthy();
    expect(screen.getByText("Technical disclosure")).toBeTruthy();
    expect(screen.getByLabelText("Hide more sources")).toBeTruthy();
  });
});

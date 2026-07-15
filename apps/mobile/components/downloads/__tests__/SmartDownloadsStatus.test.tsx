import { fireEvent, render } from "@testing-library/react-native";
import { useSmartDownloadStore } from "../../../stores/smartDownloadStore";
import {
  SmartDownloadPlans,
  SmartDownloadsStatusRow,
} from "../SmartDownloadsStatus";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      border: "#dddddd",
      tint: "#5060d8",
      text: "#111111",
      textSecondary: "#666666",
      success: "#16803c",
    },
  }),
}));

jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue || _key,
  }),
}));

describe("SmartDownloadsStatus", () => {
  beforeEach(() => {
    useSmartDownloadStore.getState().resetSmartDownloads();
  });

  it("uses one compact navigation row without inline preference switches", () => {
    const onPress = jest.fn();
    const { getByLabelText, getByText, queryByRole } = render(
      <SmartDownloadsStatusRow onPress={onPress} />,
    );

    expect(getByText("Smart Downloads")).toBeTruthy();
    expect(getByText("Off")).toBeTruthy();
    expect(queryByRole("switch")).toBeNull();

    fireEvent.press(getByLabelText("Manage Smart Downloads settings"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders planned episodes as read-only queue information", () => {
    useSmartDownloadStore.setState({
      preferences: {
        ...useSmartDownloadStore.getState().preferences,
        enabled: true,
        autoDownloadNextEpisode: true,
      },
      nextEpisodePlans: {
        series: {
          seriesId: "series",
          title: "Example Series",
          season: 2,
          episode: 4,
          episodeTitle: "The Return",
          status: "planned",
        },
      },
    });

    const { getByText, queryByRole } = render(<SmartDownloadPlans />);

    expect(getByText("Planned next episodes")).toBeTruthy();
    expect(getByText("Example Series")).toBeTruthy();
    expect(getByText("S2 E4 · The Return")).toBeTruthy();
    expect(getByText("Planned")).toBeTruthy();
    expect(queryByRole("switch")).toBeNull();
  });
});

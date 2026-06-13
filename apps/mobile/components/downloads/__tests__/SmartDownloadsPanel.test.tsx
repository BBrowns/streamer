import { fireEvent, render } from "@testing-library/react-native";
import { SmartDownloadsPanel } from "../SmartDownloadsPanel";
import { useSmartDownloadStore } from "../../../stores/smartDownloadStore";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      card: "#ffffff",
      border: "#dddddd",
      error: "#b42318",
      success: "#16803c",
      warning: "#9a6700",
      tint: "#8064e8",
      text: "#211c2b",
      textSecondary: "#6f687b",
    },
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue || _key,
  }),
}));

describe("SmartDownloadsPanel", () => {
  beforeEach(() => {
    useSmartDownloadStore.getState().resetSmartDownloads();
  });

  afterEach(() => {
    useSmartDownloadStore.getState().resetSmartDownloads();
  });

  it("shows smart downloads as opt-in with honest constraints", () => {
    const screen = render(<SmartDownloadsPanel />);

    expect(screen.getByText("Smart Downloads")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.getByText("Wi-Fi only")).toBeTruthy();
    expect(screen.getByText("HLS offline remains unsupported")).toBeTruthy();

    fireEvent(
      screen.getByLabelText("Enable smart downloads"),
      "valueChange",
      true,
    );

    expect(useSmartDownloadStore.getState().preferences.enabled).toBe(true);
    expect(screen.getByText("On")).toBeTruthy();
  });

  it("toggles next episode and cleanup preferences only after enabling", () => {
    const screen = render(<SmartDownloadsPanel />);

    fireEvent(
      screen.getByLabelText("Enable smart downloads"),
      "valueChange",
      true,
    );
    fireEvent(
      screen.getByLabelText("Auto-download next episode"),
      "valueChange",
      true,
    );
    fireEvent(
      screen.getByLabelText("Auto-delete watched downloads"),
      "valueChange",
      true,
    );

    expect(useSmartDownloadStore.getState().preferences).toMatchObject({
      enabled: true,
      autoDownloadNextEpisode: true,
      autoDeleteWatched: true,
    });
  });

  it("shows planned next episodes without claiming they are downloaded", () => {
    useSmartDownloadStore.getState().updatePreferences({
      enabled: true,
      autoDownloadNextEpisode: true,
    });
    useSmartDownloadStore.getState().planNextEpisode({
      seriesId: "series-1",
      title: "Example Show",
      season: 2,
      episode: 4,
      episodeTitle: "The Plan",
      status: "planned",
    });

    const screen = render(<SmartDownloadsPanel />);

    expect(screen.getByText("Planned next episodes")).toBeTruthy();
    expect(screen.getByText("Example Show")).toBeTruthy();
    expect(screen.getByText("S2 E4 · The Plan")).toBeTruthy();
    expect(screen.getByText("planned")).toBeTruthy();
  });
});

import { fireEvent, render } from "@testing-library/react-native";
import { DetailActionPanel } from "../DetailActionPanel";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      const translations: Record<string, string> = {
        "detail.actionPanel.findingSources": "Finding sources",
        "detail.actionPanel.noSources": "No sources",
        "detail.actionPanel.findingBest": "Finding best",
        "detail.actionPanel.playBest": "Play Best",
        "detail.actionPanel.preparing": "Preparing",
        "detail.actionPanel.inLibrary": "In Library",
        "common.actions.play": "Play",
        "common.actions.castToDevice": "Cast to device",
        "common.actions.addToLibrary": "Add to Library",
        "detail.download": "Download",
        "detail.cast": "Cast",
      };

      if (key === "detail.actionPanel.sourceCount") {
        return `${options?.count ?? 0} sources`;
      }
      if (key === "detail.actionPanel.episodeCount") {
        return `${options?.count ?? 0} episodes`;
      }
      return translations[key] ?? key;
    },
  }),
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

function renderPanel(overrides = {}) {
  const callbacks = {
    onPlayBest: jest.fn(),
    onDownload: jest.fn(),
    onCast: jest.fn(),
    onToggleLibrary: jest.fn(),
  };

  return {
    ...render(
      <DetailActionPanel
        castType="movie"
        sourceCount={12}
        hasPlayableSources
        inLibrary={false}
        {...callbacks}
        {...overrides}
      />,
    ),
    callbacks,
  };
}

describe("DetailActionPanel", () => {
  it("uses consumer actions and leaves the source count to More Sources", () => {
    const { getByText, queryByText, callbacks } = renderPanel();

    fireEvent.press(getByText("Play"));
    fireEvent.press(getByText("Download"));
    fireEvent.press(getByText("Cast to device"));
    fireEvent.press(getByText("Add to Library"));

    expect(queryByText("12 sources")).toBeNull();
    expect(callbacks.onPlayBest).toHaveBeenCalledTimes(1);
    expect(callbacks.onDownload).toHaveBeenCalledTimes(1);
    expect(callbacks.onCast).toHaveBeenCalledTimes(1);
    expect(callbacks.onToggleLibrary).toHaveBeenCalledTimes(1);
  });

  it("does not show top-level playback actions for series", () => {
    const { queryByText, getByText, callbacks } = renderPanel({
      castType: "series",
      sourceCount: 0,
      episodeCount: 8,
      hasPlayableSources: false,
      inLibrary: true,
    });

    expect(queryByText("Play")).toBeNull();
    expect(queryByText("Download")).toBeNull();
    expect(queryByText("Cast to device")).toBeNull();
    expect(queryByText("8 episodes")).toBeNull();

    fireEvent.press(getByText("In Library"));

    expect(callbacks.onToggleLibrary).toHaveBeenCalledTimes(1);
    expect(callbacks.onPlayBest).not.toHaveBeenCalled();
  });

  it("disables movie playback actions when no source exists", () => {
    const { getByText, queryByText, callbacks } = renderPanel({
      sourceCount: 0,
      hasPlayableSources: false,
    });

    fireEvent.press(getByText("Play"));
    fireEvent.press(getByText("Download"));

    expect(queryByText("No sources")).toBeNull();
    expect(callbacks.onPlayBest).not.toHaveBeenCalled();
    expect(callbacks.onDownload).not.toHaveBeenCalled();
  });
});

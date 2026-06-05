import { fireEvent, render } from "@testing-library/react-native";
import { DetailActionPanel } from "../DetailActionPanel";

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
  it("keeps Play Best as the primary movie action", () => {
    const { getByText, callbacks } = renderPanel();

    fireEvent.press(getByText("Play Best"));
    fireEvent.press(getByText("Download"));
    fireEvent.press(getByText("Cast"));
    fireEvent.press(getByText("Add"));

    expect(getByText("12 sources")).toBeTruthy();
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

    expect(queryByText("Play Best")).toBeNull();
    expect(queryByText("Download")).toBeNull();
    expect(queryByText("Cast")).toBeNull();
    expect(getByText("8 episodes")).toBeTruthy();

    fireEvent.press(getByText("In Library"));

    expect(callbacks.onToggleLibrary).toHaveBeenCalledTimes(1);
    expect(callbacks.onPlayBest).not.toHaveBeenCalled();
  });

  it("disables movie playback actions when no source exists", () => {
    const { getByText, callbacks } = renderPanel({
      sourceCount: 0,
      hasPlayableSources: false,
    });

    fireEvent.press(getByText("Play Best"));
    fireEvent.press(getByText("Download"));

    expect(getByText("No sources")).toBeTruthy();
    expect(callbacks.onPlayBest).not.toHaveBeenCalled();
    expect(callbacks.onDownload).not.toHaveBeenCalled();
  });
});

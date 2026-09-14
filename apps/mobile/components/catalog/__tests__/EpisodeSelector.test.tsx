import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { EpisodeSelector } from "../EpisodeSelector";

let mockParams: Record<string, string> = {};
const mockSourcePlan = jest.fn();
const onPlayStream = jest.fn();
const onPlayCandidate = jest.fn();
const onDownloadStream = jest.fn();
const onPlayIntent = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../../../lib/haptics", () => ({ hapticImpactLight: jest.fn() }));
jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      text: "#fff",
      textSecondary: "#aaa",
      tint: "#C89B6D",
      onTint: "#08090B",
    },
  }),
}));
jest.mock("../../../hooks/useWebPressableActivation", () => ({
  useWebPressableActivation: () => ({ webPressableProps: {} }),
}));
jest.mock("../../detail/TechnicalSourceDisclosure", () => ({
  TechnicalSourceDisclosure: () => null,
}));
jest.mock("../../detail/SourceChoiceList", () => ({
  useSourceChoicePlan: (input: unknown) => mockSourcePlan(input),
  SourceChoiceList: ({ onSelect }: any) => {
    const { Pressable, Text } = require("react-native");
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => onSelect({ planId: "plan" }, "candidate")}
      >
        <Text>Choose source</Text>
      </Pressable>
    );
  },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations = require("../../../locales/en.json");
      const value =
        key
          .split(".")
          .reduce((current, part) => current?.[part], translations) ?? key;
      return value.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
        String(options?.[name] ?? ""),
      );
    },
  }),
}));

const videos = [
  { id: "s0e2", season: 0, episode: 2, title: "Second special" },
  { id: "s2e1", season: 2, episode: 1, title: "Later season" },
  { id: "s1e3", season: 1, episode: 3, title: "Third episode" },
  { id: "s0e1", season: 0, episode: 1, title: "First special" },
  { id: "s1e1", season: 1, episode: 1, title: "First episode" },
];
const props = {
  seriesId: "series",
  videos,
  onPlayStream,
  onPlayCandidate,
  onDownloadStream,
  onPlayIntent,
};

describe("EpisodeSelector episode context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it("labels Specials and initially presents the first regular episode with sources collapsed", async () => {
    const screen = await render(<EpisodeSelector {...props} />);
    expect(screen.getByRole("button", { name: "Specials" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Season 1", selected: true }),
    ).toBeTruthy();
    expect(screen.queryByText("First special")).toBeNull();
    expect(mockSourcePlan).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByLabelText("Play episode 1: First episode"),
    );
    expect(onPlayStream).toHaveBeenCalledWith("First episode", 1, 1);
  });

  it("plays, warms and downloads season zero for a specials-only series", async () => {
    const screen = await render(
      <EpisodeSelector
        {...props}
        videos={videos.filter((v) => v.season === 0)}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Specials", selected: true }),
    ).toBeTruthy();
    await fireEvent(
      screen.getByLabelText("Play episode 1: First special"),
      "hoverIn",
    );
    expect(onPlayIntent).toHaveBeenCalledWith(0, 1);
    await fireEvent.press(
      screen.getByLabelText("Play episode 1: First special"),
    );
    expect(onPlayStream).toHaveBeenCalledWith("First special", 0, 1);
    await fireEvent.press(
      screen.getByLabelText("Download episode 1: First special"),
    );
    expect(onDownloadStream).toHaveBeenCalledWith(
      undefined,
      "First special",
      0,
      1,
    );
  });

  it("opens the exact deep-linked special's sources and passes its session candidate context", async () => {
    mockParams = { season: "0", episode: "2", sources: "1" };
    const screen = await render(<EpisodeSelector {...props} />);
    expect(mockSourcePlan).toHaveBeenLastCalledWith({
      contentType: "series",
      contentId: "series",
      season: 0,
      episode: 2,
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Choose source" }),
    );
    expect(onPlayCandidate).toHaveBeenCalledWith(
      { planId: "plan" },
      "candidate",
      "Second special",
      0,
      2,
    );
    await fireEvent.press(
      screen.getByLabelText("More sources for episode 2: Second special"),
    );
    expect(screen.queryByRole("button", { name: "Choose source" })).toBeNull();
  });

  it("preserves the explicit later episode without opening sources on a normal deep link", async () => {
    mockParams = { season: "2", episode: "1" };
    const screen = await render(<EpisodeSelector {...props} />);
    expect(
      screen.getByRole("button", { name: "Season 2", selected: true }),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByLabelText("Play episode 1: Later season"),
    );
    expect(onPlayStream).toHaveBeenCalledWith("Later season", 2, 1);
    expect(mockSourcePlan).not.toHaveBeenCalled();
  });

  it("keeps a user's chosen season across a metadata refresh and follows a new recovery route", async () => {
    const screen = await render(<EpisodeSelector {...props} />);
    await fireEvent.press(screen.getByRole("button", { name: "Specials" }));
    await screen.rerender(<EpisodeSelector {...props} videos={[...videos]} />);
    expect(screen.getByText("First special")).toBeTruthy();
    mockParams = { season: "2", episode: "1", sources: "1" };
    await screen.rerender(<EpisodeSelector {...props} videos={[...videos]} />);
    expect(screen.getByText("Later season")).toBeTruthy();
    expect(mockSourcePlan).toHaveBeenLastCalledWith({
      contentType: "series",
      contentId: "series",
      season: 2,
      episode: 1,
    });
  });

  it("selects from asynchronously arriving metadata", async () => {
    const screen = await render(<EpisodeSelector {...props} videos={[]} />);
    expect(screen.getByText("No episode data available.")).toBeTruthy();
    await screen.rerender(<EpisodeSelector {...props} />);
    expect(screen.getByText("First episode")).toBeTruthy();
  });

  it("omits negative, fractional and unnumbered episodes from the controls", async () => {
    const screen = await render(
      <EpisodeSelector
        {...props}
        videos={[
          { id: "bad-season", season: -1, episode: 1, title: "Invalid" },
          { id: "fraction-season", season: 0.5, episode: 1, title: "Invalid" },
          { id: "bad-episode", season: 1, episode: -1, title: "Invalid" },
          { id: "fraction-episode", season: 1, episode: 1.5, title: "Invalid" },
          { id: "zero-episode", season: 1, episode: 0, title: "Invalid" },
        ]}
      />,
    );
    expect(screen.getByText("No episode data available.")).toBeTruthy();
    expect(screen.queryByText("Invalid")).toBeNull();
    expect(mockSourcePlan).not.toHaveBeenCalled();
  });
});

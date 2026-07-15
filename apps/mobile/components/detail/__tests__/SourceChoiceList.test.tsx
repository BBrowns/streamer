import { fireEvent, render } from "@testing-library/react-native";
import type { PlaybackPlan } from "@streamer/shared";
import { SourceChoiceList } from "../SourceChoiceList";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      surfaceElevated: "#181b21",
      card: "#111318",
      text: "#f4f5f7",
      textSecondary: "#9da3ae",
      tint: "#6c79f5",
      warning: "#d7a15f",
      focus: "#6c79f5",
    },
  }),
}));

describe("SourceChoiceList", () => {
  it("announces quality, size, language and compatibility for each choice", () => {
    const plan = { action: "play" } as PlaybackPlan;
    const onSelect = jest.fn();
    const screen = render(
      <SourceChoiceList
        state={{
          plan,
          loading: false,
          error: null,
          retry: jest.fn(),
          choices: [
            {
              candidateId: "candidate-en",
              quality: { kind: "label", value: "1080P" },
              sizeBytes: 2 * 1024 * 1024,
              language: { kind: "code", code: "en" },
              compatibility: "ready",
            },
          ],
        }}
        onSelect={onSelect}
      />,
    );

    fireEvent.press(
      screen.getByLabelText("1080P, 2 MB, EN, Ready on this device"),
    );

    expect(onSelect).toHaveBeenCalledWith(plan, "candidate-en");
  });
});

import { fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import type { PlaybackPlan } from "@streamer/shared";
import { SourceChoiceList } from "../SourceChoiceList";
import {
  getSourceChoicePreview,
  getSourceChoiceRemainder,
} from "../sourceChoices";

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
  it.each([0, 1, 7, 8, 50, 200])(
    "keeps a six-item preview for %i source choices",
    (count) => {
      const choices = Array.from({ length: count }, (_, index) => ({
        candidateId: String(index),
      })) as any;

      expect(getSourceChoicePreview(choices)).toHaveLength(Math.min(count, 6));
      expect(getSourceChoiceRemainder(choices)).toHaveLength(
        Math.max(0, count - 6),
      );
    },
  );

  it("shows a compact preview before rendering the full source list", async () => {
    const plan = { action: "play" } as PlaybackPlan;
    const onSelect = jest.fn();
    const choices = Array.from({ length: 8 }, (_, index) => ({
      candidateId: `candidate-${index}`,
      quality: { kind: "label" as const, value: "1080P" },
      language: { kind: "code" as const, code: "en" },
      compatibility: "ready" as const,
    }));
    function Harness() {
      const [showAll, setShowAll] = useState(false);
      return (
        <SourceChoiceList
          state={{
            plan,
            loading: false,
            error: null,
            retry: jest.fn(),
            choices,
          }}
          onSelect={onSelect}
          maxChoices={6}
          showAll={showAll}
          onShowAll={() => setShowAll(true)}
        />
      );
    }

    const screen = await render(<Harness />);

    expect(screen.getByTestId("source-choice-show-all")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(7);

    await fireEvent.press(screen.getByTestId("source-choice-show-all"));

    expect(screen.queryByTestId("source-choice-show-all")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(8);
  });

  it("announces quality, size, language and compatibility for each choice", async () => {
    const plan = { action: "play" } as PlaybackPlan;
    const onSelect = jest.fn();
    const screen = await render(
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

    await fireEvent.press(
      screen.getByLabelText("1080P, 2 MB, EN, Ready on this device"),
    );

    expect(onSelect).toHaveBeenCalledWith(plan, "candidate-en");
  });
});

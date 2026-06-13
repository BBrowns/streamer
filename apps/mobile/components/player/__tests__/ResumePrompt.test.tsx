import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { ResumePrompt } from "../ResumePrompt";

describe("ResumePrompt", () => {
  it("shows the formatted resume position when provided", () => {
    const onResponse = jest.fn();
    const screen = render(
      <ResumePrompt
        onResponse={onResponse}
        title="Example Episode"
        resumeTimeSeconds={754}
      />,
    );

    expect(screen.getByText("Resume from 12:34?")).toBeTruthy();
    expect(screen.getByText("Example Episode")).toBeTruthy();

    fireEvent.press(screen.getByText("Resume"));
    expect(onResponse).toHaveBeenCalledWith(true);
  });
});

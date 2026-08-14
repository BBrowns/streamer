import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { PlayerTimeline } from "../PlayerTimeline";

describe("PlayerTimeline", () => {
  it("previews continuously while dragging and commits once on release", async () => {
    const onPreviewSeek = jest.fn();
    const onSeekTo = jest.fn();
    const onScrubbingChange = jest.fn();
    const screen = await render(
      <PlayerTimeline
        currentTime={20}
        duration={100}
        bufferedPosition={50}
        isPlaying
        canSeek
        onPreviewSeek={onPreviewSeek}
        onSeekTo={onSeekTo}
        onScrubbingChange={onScrubbingChange}
      />,
    );
    const slider = screen.getByTestId("player-progress-slider");

    await fireEvent(slider, "layout", {
      nativeEvent: { layout: { width: 200, height: 24, x: 0, y: 0 } },
    });
    await fireEvent(slider, "responderGrant", {
      nativeEvent: { locationX: 40 },
      persist: jest.fn(),
    });
    await fireEvent(slider, "responderMove", {
      nativeEvent: { locationX: 120 },
      persist: jest.fn(),
    });

    expect(screen.getByText("1:00")).toBeTruthy();
    expect(onPreviewSeek).toHaveBeenLastCalledWith(60);
    expect(onSeekTo).not.toHaveBeenCalled();
    expect(onScrubbingChange).toHaveBeenCalledWith({
      state: "started",
      shouldResume: true,
    });

    await fireEvent(slider, "responderRelease", {
      nativeEvent: { locationX: 120 },
      persist: jest.fn(),
    });

    expect(onSeekTo).toHaveBeenCalledTimes(1);
    expect(onSeekTo).toHaveBeenCalledWith(60);
    expect(onScrubbingChange).toHaveBeenLastCalledWith({
      state: "committed",
      shouldResume: true,
    });
  });

  it("ends scrubbing without seeking when the responder is cancelled", async () => {
    const onPreviewSeek = jest.fn();
    const onSeekTo = jest.fn();
    const onScrubbingChange = jest.fn();
    const screen = await render(
      <PlayerTimeline
        currentTime={20}
        duration={100}
        bufferedPosition={50}
        isPlaying
        canSeek
        onPreviewSeek={onPreviewSeek}
        onSeekTo={onSeekTo}
        onScrubbingChange={onScrubbingChange}
      />,
    );
    const slider = screen.getByTestId("player-progress-slider");

    await fireEvent(slider, "layout", {
      nativeEvent: { layout: { width: 200, height: 24, x: 0, y: 0 } },
    });
    await fireEvent(slider, "responderGrant", {
      nativeEvent: { locationX: 40 },
      persist: jest.fn(),
    });
    await fireEvent(slider, "responderMove", {
      nativeEvent: { locationX: 120 },
      persist: jest.fn(),
    });
    await fireEvent(slider, "responderTerminate", {
      nativeEvent: { locationX: 120 },
      persist: jest.fn(),
    });

    expect(onSeekTo).not.toHaveBeenCalled();
    expect(onPreviewSeek).toHaveBeenLastCalledWith(60);
    expect(onScrubbingChange).toHaveBeenNthCalledWith(1, {
      state: "started",
      shouldResume: true,
    });
    expect(onScrubbingChange).toHaveBeenNthCalledWith(2, {
      state: "cancelled",
      shouldResume: true,
      restorePosition: 20,
    });
  });

  it("shows watched and buffered progress as separate layers", async () => {
    const screen = await render(
      <PlayerTimeline
        currentTime={25}
        duration={100}
        bufferedPosition={70}
        isPlaying={false}
        canSeek
        onSeekTo={jest.fn()}
      />,
    );

    expect(screen.getByTestId("player-timeline-buffered")).toHaveStyle({
      width: "70%",
    });
    expect(screen.getByTestId("player-timeline-watched")).toHaveStyle({
      width: "25%",
    });
  });

  it("supports keyboard and accessibility seeking", async () => {
    const onSeekBy = jest.fn();
    const onSeekTo = jest.fn();
    const screen = await render(
      <PlayerTimeline
        currentTime={20}
        duration={100}
        bufferedPosition={0}
        isPlaying
        canSeek
        onSeekBy={onSeekBy}
        onSeekTo={onSeekTo}
      />,
    );
    const slider = screen.getByTestId("player-progress-slider");
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();

    await fireEvent(slider, "keyDown", {
      key: "End",
      preventDefault,
      stopPropagation,
    });
    await fireEvent(slider, "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });

    expect(onSeekTo).toHaveBeenCalledWith(100);
    expect(onSeekBy).toHaveBeenCalledWith(-10);
  });

  it("keeps unavailable timelines honest and non-interactive", async () => {
    const onSeekTo = jest.fn();
    const screen = await render(
      <PlayerTimeline
        currentTime={20}
        duration={100}
        bufferedPosition={80}
        isPlaying
        canSeek={false}
        unavailableMessage="Preparing seek controls"
        onSeekTo={onSeekTo}
      />,
    );

    expect(screen.getByText("Preparing seek controls")).toBeTruthy();
    expect(screen.getByLabelText("Playback progress unavailable")).toHaveProp(
      "accessibilityState",
      { disabled: true },
    );
    expect(onSeekTo).not.toHaveBeenCalled();
  });
});

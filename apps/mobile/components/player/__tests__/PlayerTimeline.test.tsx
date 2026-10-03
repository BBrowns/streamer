import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  createGestureController,
  getByGestureTestId,
} from "react-native-gesture-handler/jest-utils";
import {
  formatTimelineTime,
  PlayerTimeline,
  type PlayerTimelineProps,
} from "../PlayerTimeline";

function renderTimeline(props: PlayerTimelineProps) {
  return render(
    <GestureHandlerRootView>
      <PlayerTimeline {...props} />
    </GestureHandlerRootView>,
  );
}

describe("PlayerTimeline", () => {
  it("formats full-title durations with hours", () => {
    expect(formatTimelineTime(3_600)).toBe("1:00:00");
    expect(formatTimelineTime(5_508)).toBe("1:31:48");
    expect(formatTimelineTime(7_200)).toBe("2:00:00");
  });

  it("previews continuously while dragging and commits once on release", async () => {
    const onPreviewSeek = jest.fn();
    const onSeekTo = jest.fn();
    const onScrubbingChange = jest.fn();
    const screen = await renderTimeline({
      currentTime: 20,
      duration: 100,
      bufferedPosition: 50,
      isPlaying: true,
      canSeek: true,
      onPreviewSeek,
      onSeekTo,
      onScrubbingChange,
    });
    const slider = screen.getByTestId("player-progress-slider");

    await fireEvent(slider, "layout", {
      nativeEvent: { layout: { width: 200, height: 24, x: 0, y: 0 } },
    });
    const gesture = createGestureController(
      getByGestureTestId("player-timeline-gesture"),
    );
    await act(async () => {
      gesture.begin({ x: 40, y: 0 });
      gesture.activate({ x: 40, y: 0 });
      gesture.update({ x: 120, y: 0 });
    });

    expect(screen.getByText("1:00")).toBeTruthy();
    expect(onPreviewSeek).toHaveBeenLastCalledWith(60);
    expect(onSeekTo).not.toHaveBeenCalled();
    expect(onScrubbingChange).toHaveBeenCalledWith({
      state: "started",
      shouldResume: true,
    });

    await act(async () => {
      gesture.end({ x: 120, y: 0 });
    });

    expect(onSeekTo).toHaveBeenCalledTimes(1);
    expect(onSeekTo).toHaveBeenCalledWith(60);
    expect(onScrubbingChange).toHaveBeenLastCalledWith({
      state: "committed",
      shouldResume: true,
    });
  });

  it("ends scrubbing without seeking when the gesture is cancelled", async () => {
    const onPreviewSeek = jest.fn();
    const onSeekTo = jest.fn();
    const onScrubbingChange = jest.fn();
    const screen = await renderTimeline({
      currentTime: 20,
      duration: 100,
      bufferedPosition: 50,
      isPlaying: true,
      canSeek: true,
      onPreviewSeek,
      onSeekTo,
      onScrubbingChange,
    });
    const slider = screen.getByTestId("player-progress-slider");

    await fireEvent(slider, "layout", {
      nativeEvent: { layout: { width: 200, height: 24, x: 0, y: 0 } },
    });
    const gesture = createGestureController(
      getByGestureTestId("player-timeline-gesture"),
    );
    await act(async () => {
      gesture.begin({ x: 40, y: 0 });
      gesture.activate({ x: 40, y: 0 });
      gesture.update({ x: 120, y: 0 });
      gesture.cancel({ x: 120, y: 0 });
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

  it("does not commit a drag outside the published seekable ranges", async () => {
    const onSeekTo = jest.fn();
    const onScrubbingChange = jest.fn();
    const screen = await renderTimeline({
      currentTime: 20,
      duration: 100,
      bufferedPosition: 20,
      seekableRanges: [{ start: 0, end: 30 }],
      isPlaying: true,
      canSeek: true,
      onSeekTo,
      onScrubbingChange,
    });
    const slider = screen.getByTestId("player-progress-slider");

    await fireEvent(slider, "layout", {
      nativeEvent: { layout: { width: 200, height: 24, x: 0, y: 0 } },
    });
    const gesture = createGestureController(
      getByGestureTestId("player-timeline-gesture"),
    );
    await act(async () => {
      gesture.begin({ x: 40, y: 0 });
      gesture.activate({ x: 40, y: 0 });
      gesture.update({ x: 120, y: 0 });
      gesture.end({ x: 120, y: 0 });
    });

    expect(onSeekTo).not.toHaveBeenCalled();
    expect(onScrubbingChange).toHaveBeenLastCalledWith({
      state: "cancelled",
      shouldResume: true,
      restorePosition: 20,
    });
  });

  it("allows a full-title drag when the manifest can seek on request", async () => {
    const onSeekTo = jest.fn();
    const screen = await renderTimeline({
      currentTime: 20,
      duration: 100,
      bufferedPosition: 20,
      seekableRanges: [{ start: 0, end: 25 }],
      seekableOnRequest: true,
      isPlaying: true,
      canSeek: true,
      onSeekTo,
    });
    const slider = screen.getByTestId("player-progress-slider");

    await fireEvent(slider, "layout", {
      nativeEvent: { layout: { width: 200, height: 24, x: 0, y: 0 } },
    });
    const gesture = createGestureController(
      getByGestureTestId("player-timeline-gesture"),
    );
    await act(async () => {
      gesture.begin({ x: 40, y: 0 });
      gesture.activate({ x: 40, y: 0 });
      gesture.update({ x: 120, y: 0 });
      gesture.end({ x: 120, y: 0 });
    });

    expect(onSeekTo).toHaveBeenCalledWith(60);
  });

  it("shows watched and buffered progress as separate layers", async () => {
    const screen = await renderTimeline({
      currentTime: 25,
      duration: 100,
      bufferedPosition: 70,
      isPlaying: false,
      canSeek: true,
      onSeekTo: jest.fn(),
    });

    expect(screen.getByTestId("player-timeline-buffered")).toHaveStyle({
      width: "70%",
    });
    expect(screen.getByTestId("player-timeline-watched")).toHaveStyle({
      width: "25%",
    });
  });

  it("shows disjoint buffered ranges and an on-demand seekable timeline", async () => {
    const screen = await renderTimeline({
      currentTime: 90,
      duration: 100,
      bufferedPosition: 93,
      bufferedRanges: [
        { start: 1, end: 5 },
        { start: 89, end: 93 },
      ],
      seekableRanges: [{ start: 0, end: 100 }],
      seekableOnRequest: true,
      isPlaying: false,
      canSeek: true,
      onSeekTo: jest.fn(),
    });

    expect(
      screen.getByTestId("player-timeline-seekable-on-request"),
    ).toHaveStyle({ width: "100%" });
    expect(screen.getByTestId("player-timeline-buffered")).toHaveStyle({
      left: "1%",
      width: "4%",
    });
    expect(screen.getByTestId("player-timeline-buffered-1")).toHaveStyle({
      left: "89%",
      width: "4%",
    });
  });

  it("does not infer an earlier buffered range when the explicit range list is empty", async () => {
    const screen = await renderTimeline({
      currentTime: 90,
      duration: 120,
      bufferedPosition: 40,
      bufferedRanges: [],
      seekableRanges: [{ start: 0, end: 120 }],
      isPlaying: false,
      canSeek: true,
      onSeekTo: jest.fn(),
    });

    expect(screen.getByTestId("player-timeline-seekable-0")).toBeTruthy();
    expect(screen.queryByTestId("player-timeline-buffered")).toBeNull();
  });

  it("supports keyboard and accessibility seeking", async () => {
    const onSeekBy = jest.fn();
    const onSeekTo = jest.fn();
    const screen = await renderTimeline({
      currentTime: 20,
      duration: 100,
      bufferedPosition: 0,
      isPlaying: true,
      canSeek: true,
      onSeekBy,
      onSeekTo,
    });
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
    const screen = await renderTimeline({
      currentTime: 20,
      duration: 100,
      bufferedPosition: 80,
      isPlaying: true,
      canSeek: false,
      unavailableMessage: "Preparing seek controls",
      onSeekTo,
    });

    expect(screen.getByText("Preparing seek controls")).toBeTruthy();
    expect(screen.getByLabelText("Playback progress unavailable")).toHaveProp(
      "accessibilityState",
      { disabled: true },
    );
    expect(onSeekTo).not.toHaveBeenCalled();
  });
});

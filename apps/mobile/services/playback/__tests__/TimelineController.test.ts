import {
  TimelineController,
  clampTimelinePosition,
  getTimelinePositionFromOffset,
} from "../TimelineController";

describe("TimelineController", () => {
  it("clamps invalid and out-of-range positions", () => {
    expect(clampTimelinePosition(Number.NaN, 120)).toBe(0);
    expect(clampTimelinePosition(-5, 120)).toBe(0);
    expect(clampTimelinePosition(140, 120)).toBe(120);
    expect(clampTimelinePosition(45, 120)).toBe(45);
  });

  it("maps pointer offsets to a bounded media position", () => {
    expect(getTimelinePositionFromOffset(50, 200, 120)).toBe(30);
    expect(getTimelinePositionFromOffset(-10, 200, 120)).toBe(0);
    expect(getTimelinePositionFromOffset(300, 200, 120)).toBe(120);
    expect(getTimelinePositionFromOffset(50, 0, 120)).toBe(0);
  });

  it("previews during drag and commits only once on release", () => {
    const onPreview = jest.fn();
    const onCommit = jest.fn();
    const onScrubbingChange = jest.fn();
    const controller = new TimelineController({
      onPreview,
      onCommit,
      onScrubbingChange,
    });

    controller.beginDrag({
      offset: 40,
      width: 200,
      duration: 100,
      wasPlaying: true,
      initialPosition: 20,
    });
    controller.updateDrag({ offset: 120, width: 200, duration: 100 });

    expect(onPreview).toHaveBeenLastCalledWith(60);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onScrubbingChange).toHaveBeenCalledWith({
      state: "started",
      shouldResume: true,
    });

    expect(controller.commitDrag()).toEqual({
      position: 60,
      shouldResume: true,
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(60, true);
    expect(onScrubbingChange).toHaveBeenLastCalledWith({
      state: "committed",
      shouldResume: true,
    });

    controller.commitDrag();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("cancels without committing watched progress", () => {
    const onPreview = jest.fn();
    const onCommit = jest.fn();
    const onScrubbingChange = jest.fn();
    const controller = new TimelineController({
      onPreview,
      onCommit,
      onScrubbingChange,
    });

    controller.beginDrag({
      offset: 80,
      width: 100,
      duration: 100,
      wasPlaying: false,
      initialPosition: 25,
    });
    controller.updateDrag({ offset: 60, width: 100, duration: 100 });
    controller.cancelDrag();

    expect(onCommit).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenLastCalledWith(60);
    expect(onScrubbingChange).toHaveBeenLastCalledWith({
      state: "cancelled",
      shouldResume: false,
      restorePosition: 25,
    });
    expect(controller.snapshot()).toEqual({
      isScrubbing: false,
      previewPosition: null,
      wasPlaying: false,
    });
  });
});

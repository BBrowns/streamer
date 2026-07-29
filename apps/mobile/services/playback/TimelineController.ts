export interface TimelineDragInput {
  offset: number;
  width: number;
  duration: number;
}

export interface TimelineControllerCallbacks {
  onPreview: (position: number) => void;
  onCommit: (position: number, shouldResume: boolean) => void;
  onScrubbingChange?: (change: TimelineScrubbingChange) => void;
}

export type TimelineScrubbingChange =
  | { state: "started"; shouldResume: boolean }
  | { state: "committed"; shouldResume: boolean }
  | {
      state: "cancelled";
      shouldResume: boolean;
      restorePosition: number;
    };

export interface TimelineControllerSnapshot {
  isScrubbing: boolean;
  previewPosition: number | null;
  wasPlaying: boolean;
}

export function clampTimelinePosition(position: number, duration: number) {
  if (
    !Number.isFinite(position) ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return 0;
  }
  return Math.min(duration, Math.max(0, position));
}

export function getTimelinePositionFromOffset(
  offset: number,
  width: number,
  duration: number,
) {
  if (
    !Number.isFinite(offset) ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return 0;
  }

  return clampTimelinePosition((offset / width) * duration, duration);
}

/**
 * Owns timeline interaction state only. Media state and watched progress stay
 * with the media adapter and accepted-event playback clock respectively.
 */
export class TimelineController {
  private dragStartPosition: number | null = null;

  private state: TimelineControllerSnapshot = {
    isScrubbing: false,
    previewPosition: null,
    wasPlaying: false,
  };

  constructor(private readonly callbacks: TimelineControllerCallbacks) {}

  snapshot(): TimelineControllerSnapshot {
    return { ...this.state };
  }

  beginDrag(
    input: TimelineDragInput & {
      wasPlaying: boolean;
      initialPosition: number;
    },
  ) {
    const previewPosition = getTimelinePositionFromOffset(
      input.offset,
      input.width,
      input.duration,
    );
    this.state = {
      isScrubbing: true,
      previewPosition,
      wasPlaying: input.wasPlaying,
    };
    this.dragStartPosition = clampTimelinePosition(
      input.initialPosition,
      input.duration,
    );
    this.callbacks.onScrubbingChange?.({
      state: "started",
      shouldResume: input.wasPlaying,
    });
    this.callbacks.onPreview(previewPosition);
    return previewPosition;
  }

  updateDrag(input: TimelineDragInput) {
    if (!this.state.isScrubbing) return null;
    const previewPosition = getTimelinePositionFromOffset(
      input.offset,
      input.width,
      input.duration,
    );
    this.state = { ...this.state, previewPosition };
    this.callbacks.onPreview(previewPosition);
    return previewPosition;
  }

  commitDrag() {
    if (!this.state.isScrubbing || this.state.previewPosition === null) {
      return null;
    }

    const result = {
      position: this.state.previewPosition,
      shouldResume: this.state.wasPlaying,
    };
    this.callbacks.onCommit(result.position, result.shouldResume);
    this.callbacks.onScrubbingChange?.({
      state: "committed",
      shouldResume: result.shouldResume,
    });
    this.dragStartPosition = null;
    this.state = {
      isScrubbing: false,
      previewPosition: null,
      wasPlaying: result.shouldResume,
    };
    return result;
  }

  cancelDrag() {
    if (!this.state.isScrubbing) return;
    const shouldResume = this.state.wasPlaying;
    const restorePosition =
      this.dragStartPosition ?? this.state.previewPosition ?? 0;
    this.callbacks.onScrubbingChange?.({
      state: "cancelled",
      shouldResume,
      restorePosition,
    });
    this.dragStartPosition = null;
    this.state = {
      isScrubbing: false,
      previewPosition: null,
      wasPlaying: shouldResume,
    };
  }
}

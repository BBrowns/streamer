import {
  initialPlaybackRuntimeViewState,
  reducePlaybackRuntimeViewState,
} from "../PlaybackRuntimeCoordinator";

describe("PlaybackRuntimeCoordinator", () => {
  it("does not claim playing before the first rendered frame", () => {
    const loading = reducePlaybackRuntimeViewState(
      initialPlaybackRuntimeViewState,
      { type: "media_loading" },
    );
    const ready = reducePlaybackRuntimeViewState(loading, {
      type: "media_ready",
      shouldPlay: true,
    });

    expect(ready).toEqual({
      kind: "buffering",
      hasRenderedFrame: false,
      shouldPlay: true,
    });

    expect(
      reducePlaybackRuntimeViewState(ready, { type: "first_frame_rendered" }),
    ).toEqual({
      kind: "playing",
      hasRenderedFrame: true,
    });
  });

  it("preserves pause intent through a source replacement", () => {
    const replacing = reducePlaybackRuntimeViewState(
      { kind: "paused", hasRenderedFrame: true },
      {
        type: "source_replacement_started",
        reason: "seekable_handoff",
        resumeAt: 91,
      },
    );

    expect(replacing).toMatchObject({
      kind: "replacing_source",
      reason: "seekable_handoff",
      resumeAt: 91,
      shouldPlay: false,
    });
    expect(
      reducePlaybackRuntimeViewState(replacing, {
        type: "source_replacement_completed",
      }),
    ).toEqual({ kind: "paused", hasRenderedFrame: true });
  });

  it("preserves accepted position and viewer intent through fallback", () => {
    const switching = reducePlaybackRuntimeViewState(
      { kind: "playing", hasRenderedFrame: true },
      { type: "fallback_started", resumeAt: 133.5, attempt: 2 },
    );

    expect(switching).toEqual({
      kind: "switching_fallback",
      resumeAt: 133.5,
      shouldPlay: true,
      attempt: 2,
    });
    expect(
      reducePlaybackRuntimeViewState(switching, {
        type: "fallback_media_ready",
      }),
    ).toEqual({
      kind: "buffering",
      hasRenderedFrame: false,
      shouldPlay: true,
      resumeAt: 133.5,
    });
  });

  it("represents scrubbing as one state with a single resume intent", () => {
    const scrubbing = reducePlaybackRuntimeViewState(
      { kind: "playing", hasRenderedFrame: true },
      { type: "scrubbing_started", previewPosition: 10 },
    );
    const moved = reducePlaybackRuntimeViewState(scrubbing, {
      type: "scrubbing_previewed",
      previewPosition: 42,
    });

    expect(moved).toEqual({
      kind: "scrubbing",
      previewPosition: 42,
      shouldPlay: true,
    });
    expect(
      reducePlaybackRuntimeViewState(moved, {
        type: "scrubbing_cancelled",
      }),
    ).toEqual({ kind: "playing", hasRenderedFrame: true });
  });
});

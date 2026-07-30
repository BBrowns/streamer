import { act, renderHook } from "@testing-library/react-native";
import { usePlayerMediaControls } from "../usePlayerMediaControls";

function makeMediaAdapter() {
  return {
    snapshot: jest.fn(() => ({
      status: "ready",
      currentTime: 30,
      duration: 120,
      bufferedPosition: 45,
      playing: true,
      muted: false,
      volume: 1,
      playbackRate: 1,
      canSeek: true,
    })),
    play: jest.fn(),
    pause: jest.fn(),
    seekBy: jest.fn(),
    previewSeek: jest.fn(),
    commitSeek: jest.fn(),
    beginScrubbing: jest.fn(),
    endScrubbing: jest.fn(),
    replaceSource: jest.fn(),
    getAudioTracks: jest.fn(() => []),
    getSubtitleTracks: jest.fn(() => []),
    selectAudioTrack: jest.fn(),
    selectSubtitleTrack: jest.fn(),
    generateThumbnails: jest.fn(async () => []),
  };
}

function setup(overrides: Record<string, unknown> = {}) {
  const mediaAdapter = makeMediaAdapter();
  const player = {
    currentTime: 30,
    duration: 120,
    muted: false,
    volume: 1,
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  const options = {
    player,
    mediaAdapter,
    engine: null,
    canSeek: true,
    markIntentionalSeek: jest.fn(),
    recordDiagnostic: jest.fn(),
    recordExplicitSeek: jest.fn(),
    setShowNextEpisodeOverlay: jest.fn(),
    showControls: jest.fn(),
    dispatchRuntimeViewEvent: jest.fn(),
    ...overrides,
  };
  const screen = renderHook(() => usePlayerMediaControls(options as any));
  return { ...screen, mediaAdapter, options, player };
}

describe("usePlayerMediaControls", () => {
  it("records one accepted relative seek and hides the next-episode overlay", () => {
    const { result, mediaAdapter, options } = setup();

    act(() => result.current.handleSeekBy(-10));

    expect(options.setShowNextEpisodeOverlay).toHaveBeenCalledWith(false);
    expect(options.markIntentionalSeek).toHaveBeenCalledTimes(1);
    expect(options.recordExplicitSeek).toHaveBeenCalledWith(20);
    expect(mediaAdapter.seekBy).toHaveBeenCalledWith(-10);
    expect(options.recordDiagnostic.mock.calls).toEqual([
      [{ type: "seek", outcome: "requested" }],
      [{ type: "seek", outcome: "accepted" }],
    ]);
  });

  it("keeps scrubbing state transitions and adapter lifecycle together", () => {
    const { result, mediaAdapter, options } = setup();

    act(() =>
      result.current.handleScrubbingChange({
        state: "started",
        shouldResume: true,
      }),
    );
    act(() => result.current.handlePreviewSeek(42));
    act(() =>
      result.current.handleScrubbingChange({
        state: "committed",
        shouldResume: true,
      }),
    );

    expect(mediaAdapter.beginScrubbing).toHaveBeenCalledTimes(1);
    expect(mediaAdapter.previewSeek).toHaveBeenCalledWith(42);
    expect(mediaAdapter.endScrubbing).toHaveBeenCalledWith({
      shouldResume: true,
    });
    expect(options.dispatchRuntimeViewEvent.mock.calls).toEqual([
      [{ type: "scrubbing_started", previewPosition: 30 }],
      [{ type: "scrubbing_previewed", previewPosition: 42 }],
      [{ type: "scrubbing_committed" }],
    ]);
  });

  it("reports responder cancellation separately from a committed scrub", () => {
    const { result, mediaAdapter, options } = setup();

    act(() =>
      result.current.handleScrubbingChange({
        state: "started",
        shouldResume: true,
      }),
    );
    act(() => result.current.handlePreviewSeek(42));
    act(() =>
      result.current.handleScrubbingChange({
        state: "cancelled",
        shouldResume: true,
        restorePosition: 30,
      }),
    );

    expect(mediaAdapter.commitSeek).toHaveBeenCalledWith(30);
    expect(mediaAdapter.endScrubbing).toHaveBeenCalledWith({
      shouldResume: true,
    });
    expect(options.dispatchRuntimeViewEvent).toHaveBeenLastCalledWith({
      type: "scrubbing_cancelled",
    });
  });

  it("uses the active engine only when native thumbnail generation has no result", async () => {
    const engineThumbnail = { uri: "data:image/jpeg;base64,/9j/2Q==" };
    const getThumbnail = jest.fn(async () => engineThumbnail);
    const { result, mediaAdapter } = setup({
      engine: { getThumbnail },
    });

    await expect(result.current.getTimelineThumbnail(20)).resolves.toEqual(
      engineThumbnail,
    );
    expect(mediaAdapter.generateThumbnails).toHaveBeenCalledWith([20], {
      maxWidth: 320,
      maxHeight: 180,
    });
    expect(getThumbnail).toHaveBeenCalledWith(20);
  });

  it("clamps volume and unmutes through the same player mutation boundary", () => {
    const { result, player } = setup();
    player.muted = true;

    act(() => result.current.handleVolumeChange(2));

    expect(player.volume).toBe(1);
    expect(player.muted).toBe(false);
    expect(result.current.volume).toBe(1);
    expect(result.current.muted).toBe(false);
  });
});

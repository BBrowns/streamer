import type { PlaybackRoute } from "@streamer/shared";
import { resolveEffectivePlayerCapabilities } from "../PlayerCapabilityPolicy";

function route(
  seek: PlaybackRoute["capabilities"]["seek"],
  overrides: Partial<PlaybackRoute["capabilities"]> = {},
): PlaybackRoute {
  return {
    candidateId: "candidate-1",
    executionTarget: "on-device",
    delivery: seek === "preparing" ? "progressive-fmp4" : "range-http",
    capabilities: {
      seek,
      audioTracks: true,
      embeddedSubtitles: true,
      externalSubtitles: true,
      cast: true,
      offline: true,
      thumbnails: true,
      ...overrides,
    },
  };
}

const mediaAdapter = {
  playerVolume: true,
  audioTracks: true,
  embeddedSubtitles: true,
  fullscreen: true,
  pictureInPicture: true,
  nativeThumbnails: false,
};

function resolve(
  overrides: Partial<
    Parameters<typeof resolveEffectivePlayerCapabilities>[0]
  > = {},
) {
  return resolveEffectivePlayerCapabilities({
    mediaAdapter,
    activeCast: false,
    isWeb: true,
    hasMediaInfo: true,
    hasKnownDuration: true,
    isLivePlayback: false,
    isRemuxPlayback: false,
    hasSeekableProgressiveHandoff: false,
    hasRuntimeThumbnailProvider: true,
    ...overrides,
  });
}

describe("resolveEffectivePlayerCapabilities", () => {
  it("keeps unavailable and preparing v3 routes non-seekable until handoff", () => {
    expect(resolve({ route: route("unavailable") }).canSeek).toBe(false);
    expect(resolve({ route: route("preparing") }).canSeek).toBe(false);
    expect(
      resolve({
        route: route("preparing"),
        hasSeekableProgressiveHandoff: true,
      }).canSeek,
    ).toBe(true);
  });

  it("lets an immediate v3 route override legacy remux inference", () => {
    expect(
      resolve({ route: route("immediate"), isRemuxPlayback: true }).canSeek,
    ).toBe(true);
  });

  it("retains conservative remux inference only for legacy playback", () => {
    expect(resolve({ isRemuxPlayback: true }).canSeek).toBe(false);
    expect(
      resolve({
        isRemuxPlayback: true,
        hasSeekableProgressiveHandoff: true,
      }).canSeek,
    ).toBe(true);
  });

  it("intersects route track policy with concrete adapter support", () => {
    const capabilities = resolve({
      route: route("immediate", {
        audioTracks: false,
        embeddedSubtitles: true,
        externalSubtitles: false,
      }),
      mediaAdapter: { ...mediaAdapter, embeddedSubtitles: false },
    });

    expect(capabilities.canUseAudioTracks).toBe(false);
    expect(capabilities.canUseEmbeddedSubtitles).toBe(false);
    expect(capabilities.canUseExternalSubtitles).toBe(false);
  });

  it("requires the owning adapter surface for fullscreen and PiP", () => {
    const capabilities = resolve({
      mediaAdapter: {
        ...mediaAdapter,
        fullscreen: false,
        pictureInPicture: false,
      },
    });

    expect(capabilities.canUseFullscreen).toBe(false);
    expect(capabilities.canUsePictureInPicture).toBe(false);
  });

  it("uses v3 cast and thumbnail policy while preserving legacy fallback", () => {
    const denied = resolve({
      route: route("immediate", { cast: false, thumbnails: false }),
    });
    expect(denied.canCast).toBe(false);
    expect(denied.canUseTimelineThumbnails).toBe(false);

    const legacy = resolve();
    expect(legacy.canCast).toBe(true);
    expect(legacy.canUseTimelineThumbnails).toBe(true);
  });
});

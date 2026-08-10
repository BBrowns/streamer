import type { PlaybackRoute } from "@streamer/shared";
import type { MediaPlayerCapabilities } from "./MediaPlayerAdapter";

export interface PlayerCapabilityPolicyInput {
  route?: PlaybackRoute | null;
  mediaAdapter: Pick<
    MediaPlayerCapabilities,
    | "playerVolume"
    | "audioTracks"
    | "embeddedSubtitles"
    | "fullscreen"
    | "pictureInPicture"
    | "nativeThumbnails"
  >;
  activeCast: boolean;
  isWeb: boolean;
  hasMediaInfo: boolean;
  hasKnownDuration: boolean;
  isLivePlayback: boolean;
  isRemuxPlayback: boolean;
  hasSeekableProgressiveHandoff: boolean;
  hasRuntimeThumbnailProvider: boolean;
}

export interface EffectivePlayerCapabilities {
  canSeek: boolean;
  canUseVolume: boolean;
  canUseFullscreen: boolean;
  canUsePictureInPicture: boolean;
  canUseAudioTracks: boolean;
  canUseEmbeddedSubtitles: boolean;
  canUseExternalSubtitles: boolean;
  canUseTimelineThumbnails: boolean;
  canCast: boolean;
}

/**
 * Combines the planner's route policy with concrete player/runtime support.
 * A v3 route is authoritative; legacy inference is retained only when no
 * explicit route exists.
 */
export function resolveEffectivePlayerCapabilities({
  route,
  mediaAdapter,
  activeCast,
  isWeb,
  hasMediaInfo,
  hasKnownDuration,
  isLivePlayback,
  isRemuxPlayback,
  hasSeekableProgressiveHandoff,
  hasRuntimeThumbnailProvider,
}: PlayerCapabilityPolicyInput): EffectivePlayerCapabilities {
  const routeAllowsSeek = route
    ? route.capabilities.seek === "immediate" ||
      (route.capabilities.seek === "preparing" && hasSeekableProgressiveHandoff)
    : !isRemuxPlayback || hasSeekableProgressiveHandoff;
  const routeAllows = <K extends keyof PlaybackRoute["capabilities"]>(
    capability: K,
  ) => route?.capabilities[capability] ?? true;

  return {
    canSeek:
      !activeCast && routeAllowsSeek && hasKnownDuration && !isLivePlayback,
    canUseVolume: mediaAdapter.playerVolume && !activeCast,
    canUseFullscreen: mediaAdapter.fullscreen && !activeCast,
    canUsePictureInPicture: mediaAdapter.pictureInPicture && !activeCast,
    canUseAudioTracks: mediaAdapter.audioTracks && routeAllows("audioTracks"),
    canUseEmbeddedSubtitles:
      mediaAdapter.embeddedSubtitles && routeAllows("embeddedSubtitles"),
    canUseExternalSubtitles: routeAllows("externalSubtitles"),
    canUseTimelineThumbnails:
      mediaAdapter.nativeThumbnails ||
      (hasRuntimeThumbnailProvider && routeAllows("thumbnails")),
    canCast: isWeb && hasMediaInfo && !activeCast && routeAllows("cast"),
  };
}

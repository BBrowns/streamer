import type { VideoEntry } from "@streamer/shared";

/**
 * Series cannot have one title-level Play plan: the planner needs a concrete
 * season and episode. Warm only the same first episode the Detail selector
 * initially presents, rather than fanning out across an entire series.
 */
export function getInitialSeriesPlaybackEpisode(
  videos: VideoEntry[] | undefined,
) {
  return [...(videos ?? [])]
    .filter(
      (video) =>
        Number.isFinite(video.season) && Number.isFinite(video.episode),
    )
    .sort(
      (left, right) =>
        left.season - right.season || left.episode - right.episode,
    )[0];
}

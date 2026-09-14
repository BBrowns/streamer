import type { VideoEntry } from "@streamer/shared";

export interface EpisodeCoordinates {
  season: number;
  episode: number;
}

export function isValidEpisodeCoordinates(value: {
  season?: unknown;
  episode?: unknown;
}): value is EpisodeCoordinates {
  return (
    typeof value.season === "number" &&
    Number.isSafeInteger(value.season) &&
    value.season >= 0 &&
    typeof value.episode === "number" &&
    Number.isSafeInteger(value.episode) &&
    value.episode > 0
  );
}

export function parseEpisodeRouteParams(
  season: string | string[] | undefined,
  episode: string | string[] | undefined,
): EpisodeCoordinates | undefined {
  if (
    typeof season !== "string" ||
    typeof episode !== "string" ||
    !/^\d+$/.test(season) ||
    !/^\d+$/.test(episode)
  ) {
    return undefined;
  }
  const coordinates = { season: Number(season), episode: Number(episode) };
  return isValidEpisodeCoordinates(coordinates) ? coordinates : undefined;
}

/**
 * Series cannot have one title-level Play plan: the planner needs a concrete
 * season and episode. Respect explicit episode context; otherwise present and
 * warm the first regular episode, falling back to Specials for specials-only
 * metadata. Never substitute another episode for an explicit missing target.
 */
export function getInitialSeriesPlaybackEpisode(
  videos: VideoEntry[] | undefined,
  selectedEpisode?: EpisodeCoordinates,
) {
  const validVideos = (videos ?? []).filter(isValidEpisodeCoordinates);
  if (selectedEpisode) {
    return validVideos.find(
      (video) =>
        video.season === selectedEpisode.season &&
        video.episode === selectedEpisode.episode,
    );
  }
  return validVideos.sort(
    (left, right) =>
      Number(left.season === 0) - Number(right.season === 0) ||
      left.season - right.season ||
      left.episode - right.episode,
  )[0];
}

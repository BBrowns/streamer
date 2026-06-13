import type { VideoEntry } from "@streamer/shared";
import type { SmartNextEpisodePlan } from "../stores/smartDownloadStore";

export function createNextEpisodePlan({
  seriesId,
  title,
  videos,
  downloadedSeason,
  downloadedEpisode,
}: {
  seriesId: string;
  title?: string;
  videos: VideoEntry[];
  downloadedSeason: number;
  downloadedEpisode: number;
}): SmartNextEpisodePlan | null {
  const sorted = [...videos]
    .filter(
      (video) =>
        Number.isFinite(video.season) && Number.isFinite(video.episode),
    )
    .sort((a, b) => a.season - b.season || a.episode - b.episode);

  const next = sorted.find(
    (video) =>
      video.season > downloadedSeason ||
      (video.season === downloadedSeason && video.episode > downloadedEpisode),
  );

  if (!next) return null;

  return {
    seriesId,
    title,
    season: next.season,
    episode: next.episode,
    episodeTitle: next.title,
    status: "planned",
  };
}

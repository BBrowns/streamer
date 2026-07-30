import type { VideoEntry } from "@streamer/shared";

export function findNextEpisode(
  videos: VideoEntry[] | undefined,
  current: { season?: number; episode?: number },
) {
  if (
    !videos ||
    !Number.isInteger(current.season) ||
    !Number.isInteger(current.episode)
  ) {
    return null;
  }

  const ordered = videos
    .filter(
      (video) =>
        Number.isInteger(video.season) &&
        video.season >= 0 &&
        Number.isInteger(video.episode) &&
        video.episode >= 0,
    )
    .slice()
    .sort(
      (left, right) =>
        left.season - right.season ||
        left.episode - right.episode ||
        left.id.localeCompare(right.id),
    );

  return (
    ordered.find(
      (video) =>
        video.season > current.season! ||
        (video.season === current.season && video.episode > current.episode!),
    ) ?? null
  );
}

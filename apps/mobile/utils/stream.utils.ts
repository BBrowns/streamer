import type { Stream } from "@streamer/shared";

export type Resolution = "4K" | "1080p" | "720p" | "SD" | "Unknown";

export interface GroupedStreams {
  [key: string]: Stream[];
}

export function extractResolution(title: string): Resolution {
  const t = title.toUpperCase();
  if (t.includes("2160P") || t.includes("4K") || t.includes("UHD")) return "4K";
  if (t.includes("1080P") || t.includes("FHD")) return "1080p";
  if (t.includes("720P") || t.includes("HD")) return "720p";
  if (t.includes("480P") || t.includes("SD") || t.includes("DVDRIP"))
    return "SD";
  return "Unknown";
}

export function groupStreamsByResolution(streams: Stream[]): GroupedStreams {
  const groups: GroupedStreams = {
    "4K": [],
    "1080p": [],
    "720p": [],
    SD: [],
    Unknown: [],
  };

  streams.forEach((s) => {
    // Normalize resolution from API if it exists, otherwise extract from title
    let res: string = s.resolution ? s.resolution.toUpperCase() : "";

    // Map API resolution to our keys
    let key: Resolution = "Unknown";
    if (res.includes("2160") || res.includes("4K")) key = "4K";
    else if (res.includes("1080")) key = "1080p";
    else if (res.includes("720")) key = "720p";
    else if (res.includes("480") || res === "SD") key = "SD";
    else {
      // Fallback to title extraction if API resolution is missing or unhelpful
      key = extractResolution(s.title || s.name || "");
    }

    groups[key].push(s);
  });

  // Remove empty groups
  return Object.fromEntries(
    Object.entries(groups).filter(([_, items]) => items.length > 0),
  );
}

export function extractEpisodeInfo(title: string): {
  season?: number;
  episode?: number;
  isPack?: boolean;
} {
  const t = title.toUpperCase();

  // S1 E1 or S01E01
  const sEPattern = /S(?:EASON)?\s?(\d+)\s?E(?:PISODE)?\s?(\d+)/i;
  // 1x01
  const xPattern = /(\d+)X(\d+)/i;
  // E01
  const eOnlyPattern = /E(?:PISODE)?\s?(\d+)/i;
  // Season Pack: 1-8 of 8 or Season 1
  const packPattern = /SEASON\s?(\d+)/i;

  const seMatch = t.match(sEPattern);
  if (seMatch)
    return { season: parseInt(seMatch[1]), episode: parseInt(seMatch[2]) };

  const xMatch = t.match(xPattern);
  if (xMatch)
    return { season: parseInt(xMatch[1]), episode: parseInt(xMatch[2]) };

  const eMatch = t.match(eOnlyPattern);
  if (eMatch) return { episode: parseInt(eMatch[1]) };

  const packMatch = t.match(packPattern);
  if (packMatch) return { season: parseInt(packMatch[1]), isPack: true };

  return {};
}

export function filterStreamsByEpisode(
  streams: Stream[],
  season: number,
  episode: number,
): Stream[] {
  return streams.filter((s) => {
    const {
      season: sS,
      episode: sE,
      isPack,
    } = extractEpisodeInfo(s.title || s.name || "");

    // If it's a pack for the matching season, include it
    if (isPack && sS === season) return true;

    // If it's a specific episode match
    if (sS === season && sE === episode) return true;

    // If no season info but episode matches (common for single-season shows)
    if (sS === undefined && sE === episode) return true;

    // Fallback: If it's a movie type stream (unlikely here but safety)
    return false;
  });
}

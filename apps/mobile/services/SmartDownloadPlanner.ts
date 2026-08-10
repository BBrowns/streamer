import type { VideoEntry } from "@streamer/shared";
import {
  normalizeSmartDownloadQuality,
  type SmartDownloadPreferences,
  type SmartDownloadQuality,
  type SmartNextEpisodePlan,
  type SmartNextEpisodePlanStatus,
} from "../stores/smartDownloadStore";

export type SmartDownloadNetwork = "wifi" | "cellular" | "unknown";

export type SmartDownloadPolicyReason =
  | "disabled"
  | "wifi_only"
  | "storage_limit";

export interface SmartDownloadPolicyContext {
  network?: SmartDownloadNetwork;
  appUsageBytes?: number;
  estimatedBytes?: number;
}

export interface SmartDownloadPolicyDecision {
  status: Extract<SmartNextEpisodePlanStatus, "planned" | "blocked">;
  quality: SmartDownloadQuality;
  reason?: SmartDownloadPolicyReason;
}

function nonNegativeFinite(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * Evaluates the local, opt-in guardrails before recording a next-episode plan.
 * Unknown network and storage values fail open because this function only
 * records an intent; no background download is started here.
 */
export function evaluateSmartDownloadPolicy(
  preferences: SmartDownloadPreferences,
  context: SmartDownloadPolicyContext = {},
): SmartDownloadPolicyDecision {
  const quality = normalizeSmartDownloadQuality(preferences.quality);
  if (!preferences.enabled || !preferences.autoDownloadNextEpisode) {
    return { status: "blocked", quality, reason: "disabled" };
  }

  if (preferences.wifiOnly && context.network === "cellular") {
    return { status: "blocked", quality, reason: "wifi_only" };
  }

  const appUsageBytes = nonNegativeFinite(context.appUsageBytes);
  const estimatedBytes = nonNegativeFinite(context.estimatedBytes) || 0;
  const storageLimitBytes =
    Number.isFinite(preferences.storageLimitGb) &&
    preferences.storageLimitGb > 0
      ? preferences.storageLimitGb * 1024 ** 3
      : undefined;
  if (
    appUsageBytes !== undefined &&
    storageLimitBytes !== undefined &&
    appUsageBytes + estimatedBytes >= storageLimitBytes
  ) {
    return { status: "blocked", quality, reason: "storage_limit" };
  }

  return { status: "planned", quality };
}

export function createNextEpisodePlan({
  seriesId,
  title,
  videos,
  downloadedSeason,
  downloadedEpisode,
  status = "planned",
  reason,
  quality = "best",
}: {
  seriesId: string;
  title?: string;
  videos: VideoEntry[];
  downloadedSeason: number;
  downloadedEpisode: number;
  status?: Extract<SmartNextEpisodePlanStatus, "planned" | "blocked">;
  reason?: SmartDownloadPolicyReason;
  quality?: SmartDownloadQuality;
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
    quality: normalizeSmartDownloadQuality(quality),
    status,
    reason,
  };
}

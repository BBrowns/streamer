import type { VideoEntry } from "@streamer/shared";
import {
  createNextEpisodePlan,
  evaluateSmartDownloadPolicy,
} from "../SmartDownloadPlanner";
import { DEFAULT_SMART_DOWNLOAD_PREFERENCES } from "../../stores/smartDownloadStore";

const videos: VideoEntry[] = [
  {
    season: 1,
    episode: 1,
    id: "s1e1",
    title: "Pilot",
    released: "2026-01-01",
  },
  {
    season: 1,
    episode: 2,
    id: "s1e2",
    title: "Second",
    released: "2026-01-08",
  },
  {
    season: 2,
    episode: 1,
    id: "s2e1",
    title: "Next Season",
    released: "2026-02-01",
  },
];

describe("SmartDownloadPlanner", () => {
  it("plans the next chronological episode after a downloaded episode", () => {
    expect(
      createNextEpisodePlan({
        seriesId: "series-1",
        title: "Example Show",
        videos,
        downloadedSeason: 1,
        downloadedEpisode: 2,
      }),
    ).toMatchObject({
      seriesId: "series-1",
      title: "Example Show",
      season: 2,
      episode: 1,
      episodeTitle: "Next Season",
      status: "planned",
    });
  });

  it("returns null at the end of the series", () => {
    expect(
      createNextEpisodePlan({
        seriesId: "series-1",
        title: "Example Show",
        videos,
        downloadedSeason: 2,
        downloadedEpisode: 1,
      }),
    ).toBeNull();
  });

  it("blocks cellular planning when Wi-Fi-only is enabled", () => {
    expect(
      evaluateSmartDownloadPolicy(
        {
          ...DEFAULT_SMART_DOWNLOAD_PREFERENCES,
          enabled: true,
          autoDownloadNextEpisode: true,
        },
        { network: "cellular" },
      ),
    ).toEqual({
      status: "blocked",
      quality: "best",
      reason: "wifi_only",
    });
  });

  it("blocks a plan that would reach the configured storage limit", () => {
    expect(
      evaluateSmartDownloadPolicy(
        {
          ...DEFAULT_SMART_DOWNLOAD_PREFERENCES,
          enabled: true,
          autoDownloadNextEpisode: true,
          storageLimitGb: 2,
          quality: "720p",
        },
        {
          network: "wifi",
          appUsageBytes: 2 * 1024 ** 3 - 1_000,
          estimatedBytes: 1_000,
        },
      ),
    ).toEqual({
      status: "blocked",
      quality: "720p",
      reason: "storage_limit",
    });
  });

  it("keeps unknown network and storage values fail-open while carrying quality", () => {
    expect(
      evaluateSmartDownloadPolicy(
        {
          ...DEFAULT_SMART_DOWNLOAD_PREFERENCES,
          enabled: true,
          autoDownloadNextEpisode: true,
          quality: "1080p",
        },
        { network: "unknown" },
      ),
    ).toEqual({ status: "planned", quality: "1080p" });
  });

  it("records policy status, reason, and quality on the next episode intent", () => {
    expect(
      createNextEpisodePlan({
        seriesId: "series-1",
        videos,
        downloadedSeason: 1,
        downloadedEpisode: 1,
        status: "blocked",
        reason: "wifi_only",
        quality: "720p",
      }),
    ).toMatchObject({
      season: 1,
      episode: 2,
      status: "blocked",
      reason: "wifi_only",
      quality: "720p",
    });
  });
});

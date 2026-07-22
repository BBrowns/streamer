import { describe, expect, it } from "vitest";
import type {
  DeviceProfile,
  MediaCandidate,
  PlaybackQuality,
} from "@streamer/shared";
import {
  normalizeStream,
  qualityAllowedByPreferences,
  scoreCandidate,
} from "./source-normalizer.js";

const webProfile: DeviceProfile = {
  platform: "web",
  maxQuality: "2160p",
  network: "local",
  supports: {
    h264: true,
    h265: true,
    av1: false,
    mp4: true,
    mkv: true,
    hls: true,
    dolbyVision: false,
    aac: true,
    ac3: true,
    eac3: true,
  },
};

function candidate(options: {
  kind: MediaCandidate["kind"];
  quality: "2160p" | "1080p" | "720p";
  seeders?: number;
}): MediaCandidate {
  const { kind, quality, seeders } = options;
  const isTorrent = kind === "torrent";
  const url =
    kind === "hls"
      ? `https://cdn.example.test/${quality}/playlist.m3u8`
      : `https://cdn.example.test/${quality}/movie.mp4`;

  return {
    id: `${kind}-${quality}-${seeders ?? "unknown"}`,
    stream: isTorrent
      ? {
          infoHash: `hash-${quality}-${seeders ?? "unknown"}`,
          title: `Movie.${quality}.H264.AAC.mp4`,
          resolution: quality,
          seeders,
        }
      : {
          url,
          title: `Movie.${quality}.H264.AAC.${kind === "hls" ? "HLS" : "mp4"}`,
          resolution: quality,
        },
    kind,
    quality,
    container: kind === "hls" ? "hls" : "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    audioLanguage: "en",
    hdr: "sdr",
    seeders,
    riskFlags: [],
  };
}

describe("scoreCandidate", () => {
  it("prefers a healthy allowed 1080p torrent over a weak allowed 2160p torrent", () => {
    const weak2160p = candidate({
      kind: "torrent",
      quality: "2160p",
      seeders: 1,
    });
    const healthy1080p = candidate({
      kind: "torrent",
      quality: "1080p",
      seeders: 80,
    });
    const preferences: { allowedQualities: PlaybackQuality[] } = {
      allowedQualities: ["2160p", "1080p"],
    };

    expect(qualityAllowedByPreferences(weak2160p, preferences)).toBe(true);
    expect(qualityAllowedByPreferences(healthy1080p, preferences)).toBe(true);
    expect(
      scoreCandidate(healthy1080p, "play", webProfile, true),
    ).toBeGreaterThan(scoreCandidate(weak2160p, "play", webProfile, true));
  });

  it("keeps the quality allowlist separate from ranking", () => {
    const excluded720p = candidate({ kind: "direct", quality: "720p" });

    expect(
      qualityAllowedByPreferences(excluded720p, {
        allowedQualities: ["2160p", "1080p"],
      }),
    ).toBe(false);
  });

  it("puts direct playback readiness before resolution, then uses quality as a tie-breaker", () => {
    const direct1080p = candidate({ kind: "direct", quality: "1080p" });
    const torrent2160p = candidate({
      kind: "torrent",
      quality: "2160p",
      seeders: 250,
    });
    const direct2160p = candidate({ kind: "direct", quality: "2160p" });

    expect(
      scoreCandidate(direct1080p, "play", webProfile, true),
    ).toBeGreaterThan(scoreCandidate(torrent2160p, "play", webProfile, true));
    expect(
      scoreCandidate(direct2160p, "play", webProfile, true),
    ).toBeGreaterThan(scoreCandidate(direct1080p, "play", webProfile, true));
  });

  it("defers telesync and expensive MKV remux candidates behind a healthy H264 MP4 torrent", () => {
    const telesync = normalizeStream({
      infoHash: "telesync-hash",
      title: "Movie.2026.1080p.TELESYNC.x264.ENG.mkv",
      resolution: "1080p",
      seeders: 250,
    });
    const remux = normalizeStream({
      infoHash: "remux-hash",
      title: "Movie.2026.2160p.HEVC.HDR.mkv",
      resolution: "2160p",
      seeders: 250,
    });
    const healthy = normalizeStream({
      infoHash: "healthy-hash",
      title: "Movie.2026.1080p.WEB-DL.H264.AAC.mp4",
      resolution: "1080p",
      seeders: 20,
    });
    const remuxProfile: DeviceProfile = {
      ...webProfile,
      supports: { ...webProfile.supports, mkv: false },
    };

    expect(telesync.riskFlags).toContain("low-quality-capture");
    expect(scoreCandidate(healthy, "play", remuxProfile, true)).toBeGreaterThan(
      scoreCandidate(telesync, "play", remuxProfile, true),
    );
    expect(scoreCandidate(healthy, "play", remuxProfile, true)).toBeGreaterThan(
      scoreCandidate(remux, "play", remuxProfile, true),
    );
  });

  it("keeps side-by-side 3D releases behind an otherwise comparable 2D source", () => {
    const threeDimensional = normalizeStream({
      infoHash: "3d-hash",
      title: "Movie.2026.1080p.3D.FULL-SBS.HEVC.AAC.mkv",
      resolution: "1080p",
      seeders: 300,
    });
    const conventional = normalizeStream({
      infoHash: "2d-hash",
      title: "Movie.2026.1080p.WEB-DL.H264.AAC.mp4",
      resolution: "1080p",
      seeders: 40,
    });

    expect(threeDimensional.riskFlags).toContain("three-dimensional");
    expect(
      scoreCandidate(conventional, "play", webProfile, true),
    ).toBeGreaterThan(
      scoreCandidate(threeDimensional, "play", webProfile, true),
    );
  });

  it("does not treat a signed direct URL's ts query parameter as a telesync label", () => {
    const direct = normalizeStream({
      url: "https://cdn.example.test/movie.mp4?ts=1720000000&signature=safe",
      title: "Movie.2026.1080p.WEB-DL.H264.AAC",
      resolution: "1080p",
    });

    expect(direct.riskFlags).not.toContain("low-quality-capture");
  });
});

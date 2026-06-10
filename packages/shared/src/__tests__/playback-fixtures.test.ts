import { describe, expect, it } from "vitest";
import { mediaCandidateSchema } from "../schemas/playback.schema";

const FIXTURES = [
  {
    id: "11111111-1111-4111-a111-111111111111",
    kind: "direct",
    stream: { url: "http://test.com/bbb.mp4" },
    quality: "1080p",
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    riskFlags: [],
  },
  {
    id: "22222222-2222-4222-a222-222222222222",
    kind: "hls",
    stream: { url: "http://test.com/sintel.m3u8" },
    quality: "1080p",
    container: "hls",
    videoCodec: "h264",
    audioCodec: "aac",
    riskFlags: [],
  },
  {
    id: "33333333-3333-4333-a333-333333333333",
    kind: "torrent",
    stream: { infoHash: "abcdef1234567890123456789012345678901234" },
    quality: "1080p",
    container: "mkv",
    videoCodec: "h264",
    audioCodec: "ac3",
    riskFlags: [],
  },
  {
    id: "44444444-4444-4444-a444-444444444444",
    kind: "torrent",
    stream: { infoHash: "abcdef1234567890123456789012345678901235" },
    quality: "2160p",
    container: "mkv",
    videoCodec: "h265",
    audioCodec: "eac3",
    riskFlags: [],
  },
  {
    id: "55555555-5555-4555-a555-555555555555",
    kind: "direct",
    stream: { url: "http://test.com/elephants.mp4" },
    quality: "720p",
    container: "mp4",
    videoCodec: "av1",
    audioCodec: "aac",
    riskFlags: [],
  },
];

describe("Playback Fixtures Validation", () => {
  it("validates all reference fixtures against mediaCandidateSchema", () => {
    FIXTURES.forEach((fixture) => {
      const result = mediaCandidateSchema.safeParse(fixture);
      expect(result.success).toBe(true);
    });
  });
});

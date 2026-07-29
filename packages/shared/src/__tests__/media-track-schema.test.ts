import { describe, expect, it } from "vitest";
import {
  gatewayTrackCatalogSchema,
  normalizedMediaTrackSchema,
  subtitleCandidateSchema,
} from "../index";

describe("media track schemas", () => {
  it("accepts safe normalized audio and subtitle descriptors", () => {
    expect(
      normalizedMediaTrackSchema.parse({
        id: "audio:1",
        streamIndex: 1,
        kind: "audio",
        language: "en",
        title: "English",
        codec: "eac3",
        channelCount: 6,
        channelLayout: "5.1",
        default: true,
        forced: false,
        hearingImpaired: false,
        audioDescription: false,
        commentary: false,
        source: "embedded",
        supported: true,
      }),
    ).toMatchObject({ id: "audio:1", kind: "audio", channelCount: 6 });
  });

  it("rejects raw source URLs and magnet-shaped fields in gateway catalogs", () => {
    const safe = gatewayTrackCatalogSchema.parse({
      jobId: "job-runtime-1",
      selectedFileIndex: 2,
      tracks: [],
      subtitles: [],
    });
    expect(safe).toEqual({
      jobId: "job-runtime-1",
      selectedFileIndex: 2,
      tracks: [],
      subtitles: [],
    });

    expect(() =>
      gatewayTrackCatalogSchema.parse({
        jobId: "job-runtime-1",
        selectedFileIndex: 2,
        magnet: "magnet:?xt=urn:btih:sensitive",
        tracks: [],
        subtitles: [],
      }),
    ).toThrow();
  });

  it("supports runtime-only subtitle fetch identities without provider URLs", () => {
    expect(
      subtitleCandidateSchema.parse({
        id: "addon:provider:subtitle-1",
        providerId: "provider",
        providerName: "OpenSubtitles v3",
        language: "nl",
        format: "srt",
        source: "addon",
        label: "Dutch · OpenSubtitles v3",
        hearingImpaired: false,
        forced: false,
        fileHashMatch: false,
        fileNameMatch: true,
        contentIdMatch: true,
        confidence: 0.9,
        active: false,
        fetchIdentity: "runtime-subtitle-1",
      }),
    ).toMatchObject({
      source: "addon",
      fetchIdentity: "runtime-subtitle-1",
    });
  });
});

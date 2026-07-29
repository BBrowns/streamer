import { describe, expect, it, vi } from "vitest";
import {
  createMediaProbeCache,
  discoverExternalSubtitleCandidates,
  parseFfprobeTrackCatalog,
} from "../media-probe.js";

describe("media probe", () => {
  it("normalizes multiple audio tracks and dispositions", () => {
    const tracks = parseFfprobeTrackCatalog({
      streams: [
        {
          index: 1,
          codec_type: "audio",
          codec_name: "eac3",
          channels: 6,
          channel_layout: "5.1(side)",
          tags: { language: "eng", title: "English Main" },
          disposition: { default: 1 },
        },
        {
          index: 2,
          codec_type: "audio",
          codec_name: "aac",
          channels: 2,
          channel_layout: "stereo",
          tags: { language: "nld", title: "Dutch commentary" },
          disposition: { comment: 1 },
        },
        {
          index: 4,
          codec_type: "subtitle",
          codec_name: "subrip",
          tags: { language: "eng", title: "English SDH" },
          disposition: { hearing_impaired: 1 },
        },
      ],
    });

    expect(tracks).toEqual([
      expect.objectContaining({
        id: "audio:1",
        kind: "audio",
        language: "en",
        codec: "eac3",
        channelCount: 6,
        default: true,
      }),
      expect.objectContaining({
        id: "audio:2",
        kind: "audio",
        language: "nl",
        commentary: true,
      }),
      expect.objectContaining({
        id: "subtitle:4",
        kind: "subtitle",
        hearingImpaired: true,
        supported: true,
      }),
    ]);
  });

  it("marks bitmap subtitles explicitly unsupported", () => {
    const [track] = parseFfprobeTrackCatalog({
      streams: [
        {
          index: 5,
          codec_type: "subtitle",
          codec_name: "hdmv_pgs_subtitle",
          tags: { language: "eng" },
          disposition: {},
        },
      ],
    });

    expect(track).toMatchObject({
      kind: "subtitle",
      supported: false,
      unsupportedReason: "bitmap_subtitle",
    });
  });

  it("discovers supported external subtitle files without selecting another video", () => {
    const candidates = discoverExternalSubtitleCandidates(
      [
        { name: "Show.S01E02.mkv" },
        { name: "Show.S01E02.nl.srt" },
        { name: "Show.S01E02.en.ass" },
        { name: "cover.jpg" },
      ],
      0,
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        id: "torrent-file:1",
        language: "nl",
        format: "srt",
        fetchIdentity: "external:1",
      }),
      expect.objectContaining({
        id: "torrent-file:2",
        language: "en",
        format: "ass",
        fetchIdentity: "external:2",
      }),
    ]);
  });

  it("deduplicates concurrent probes and expires bounded runtime cache entries", async () => {
    let resolveProbe!: (value: string) => void;
    const runner = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const cache = createMediaProbeCache({ ttlMs: 10, maxEntries: 2 });

    const first = cache.getOrCreate("hash:1", runner);
    const second = cache.getOrCreate("hash:1", runner);
    expect(runner).toHaveBeenCalledTimes(1);
    resolveProbe("catalog");
    await expect(first).resolves.toBe("catalog");
    await expect(second).resolves.toBe("catalog");
  });
});

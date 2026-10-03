import { describe, expect, it } from "vitest";
import {
  buildRandomAccessHlsManifest,
  parseRandomAccessObjectName,
} from "../hls-random-access.js";

describe("random access HLS manifest", () => {
  it("publishes a fixed VOD timeline with chunk-specific maps", () => {
    expect(
      buildRandomAccessHlsManifest({
        durationSeconds: 5.1,
        segmentSeconds: 2,
        segmentsPerChunk: 2,
      }),
    ).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-TARGETDURATION:2",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        '#EXT-X-MAP:URI="init-000000.mp4"',
        "#EXTINF:2.000000,",
        "segment-000000.m4s",
        "#EXTINF:2.000000,",
        "segment-000001.m4s",
        '#EXT-X-MAP:URI="init-000002.mp4"',
        "#EXTINF:1.100000,",
        "segment-000002.m4s",
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );
  });

  it("rejects invalid durations and unrequested segment identities", () => {
    expect(() =>
      buildRandomAccessHlsManifest({ durationSeconds: Number.NaN }),
    ).toThrow("Invalid random access HLS duration");
    expect(parseRandomAccessObjectName("segment-000004.m4s", 5)).toEqual({
      kind: "segment",
      index: 4,
    });
    expect(parseRandomAccessObjectName("segment-000004.m4s", 4)).toBeNull();
    expect(parseRandomAccessObjectName("init-000004.mp4", 5, 2)).toEqual({
      kind: "init",
      index: 4,
    });
    expect(parseRandomAccessObjectName("init-000003.mp4", 5, 2)).toBeNull();
    expect(parseRandomAccessObjectName("segment-999999.m4s", 5)).toBeNull();
    expect(parseRandomAccessObjectName("../secret.m4s", 5)).toBeNull();
  });
});

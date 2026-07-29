import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import {
  MAX_SUBTITLE_DOCUMENT_BYTES,
  normalizeSubtitleBuffer,
  readTorrentSubtitleBuffer,
} from "../subtitle-normalizer.js";

describe("subtitle normalization", () => {
  it("converts UTF-8 SRT to sanitized WebVTT", () => {
    const output = normalizeSubtitleBuffer(
      Buffer.from(
        `1
00:00:01,000 --> 00:00:02,500
Hello <b>world</b>

2
00:00:03,000 --> 00:00:04,000
Second line`,
      ),
      "srt",
    );

    expect(output).toContain("WEBVTT");
    expect(output).toContain("00:00:01.000 --> 00:00:02.500");
    expect(output).toContain("Hello world");
    expect(output).not.toContain("<b>");
  });

  it("converts ASS dialogue and multiline markers", () => {
    const output = normalizeSubtitleBuffer(
      Buffer.from(
        `[Events]
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello\\Nworld`,
      ),
      "ass",
    );
    expect(output).toContain("00:00:01.000 --> 00:00:03.000");
    expect(output).toContain("Hello\nworld");
  });

  it("rejects oversized and unsupported subtitle documents", () => {
    expect(() =>
      normalizeSubtitleBuffer(
        Buffer.alloc(MAX_SUBTITLE_DOCUMENT_BYTES + 1),
        "srt",
      ),
    ).toThrow(/size limit/i);
    expect(() =>
      normalizeSubtitleBuffer(Buffer.from("bitmap"), "pgs" as any),
    ).toThrow(/unsupported/i);
  });

  it("reads torrent subtitle files with a hard size boundary", async () => {
    const buffer = await readTorrentSubtitleBuffer({
      length: 11,
      createReadStream: () =>
        Readable.from([Buffer.from("hello "), Buffer.from("world")]),
    });
    expect(buffer.toString("utf8")).toBe("hello world");

    await expect(
      readTorrentSubtitleBuffer({
        length: MAX_SUBTITLE_DOCUMENT_BYTES + 1,
        createReadStream: () => Readable.from([]),
      }),
    ).rejects.toThrow(/size limit/i);
  });

  it("cancels an active torrent subtitle read", async () => {
    const controller = new AbortController();
    const stream = new Readable({ read() {} });
    const pending = readTorrentSubtitleBuffer(
      {
        createReadStream: () => stream,
      },
      controller.signal,
    );

    controller.abort(new Error("job cancelled"));
    await expect(pending).rejects.toThrow("job cancelled");
  });
});

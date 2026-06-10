/**
 * Unit tests for the torrent stream-server handler.
 *
 * Strategy: import `handleTorrent` and `waitForReady` directly (they are now
 * exported). We avoid mocking the WebTorrent client at module level to
 * prevent ESM singleton state from causing vitest to hang.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { EventEmitter } from "events";
import { writeFile } from "fs/promises";
import type { Request, Response } from "express";
import {
  handleTorrent,
  parseByteRange,
  waitForReady,
  selectBestVideoFile,
} from "../torrent-helpers.js";
import {
  __resetRemuxCacheForTests,
  __setFfmpegSpawnerForTests,
  getSelectedFile,
  serveTorrentFile,
} from "../torrent.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFakeStream() {
  const s = new EventEmitter() as any;
  s.pipe = vi.fn().mockReturnThis();
  s.destroy = vi.fn();
  return s;
}

function makeFakeFile(name = "movie.mp4", size = 1_000_000) {
  const stream = makeFakeStream();
  return {
    name,
    length: size,
    createReadStream: vi.fn().mockReturnValue(stream),
  };
}

function makeReqRes(
  headers: Record<string, string> = {},
  query: Record<string, string> = {},
  method = "GET",
) {
  const req = {
    query,
    headers,
    method,
    on: vi.fn(),
  } as unknown as Request;

  const res = new EventEmitter() as any;
  Object.assign(res, {
    headersSent: false,
    status: vi.fn().mockReturnValue(res),
    set: vi.fn().mockReturnValue(res),
    setHeader: vi.fn(),
    send: vi.fn().mockReturnValue(res),
    end: vi.fn().mockReturnValue(res),
    write: vi.fn().mockReturnValue(true),
    writeHead: vi.fn(),
    json: vi.fn().mockReturnValue(res),
    destroy: vi.fn(),
  });

  return { req, res: res as Response };
}

function makeTorrent(files: any[] = []) {
  const t = new EventEmitter() as any;
  t.files = files;
  return t;
}

function makeSuccessfulFfmpegSpawner(output: Buffer) {
  return vi.fn((_command: string, args: string[]) => {
    const child = new EventEmitter() as any;
    child.stdin = new EventEmitter() as any;
    child.stdin.write = vi.fn();
    child.stdin.end = vi.fn();
    child.stdin.destroy = vi.fn();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();

    const outputPath = args.at(-1);
    if (typeof outputPath !== "string") {
      throw new Error("Expected FFmpeg output path as the last argument");
    }

    setTimeout(() => {
      void writeFile(outputPath, output).then(() => child.emit("close", 0));
    }, 0);

    return child;
  }) as any;
}

afterEach(async () => {
  await __resetRemuxCacheForTests();
});

// ─── handleTorrent ────────────────────────────────────────────────────────────

describe("handleTorrent", () => {
  it("sends 200 with correct Content-Type and streams full file", () => {
    const file = makeFakeFile("video.mp4", 2_000_000);
    const torrent = makeTorrent([file]);
    const { req, res } = makeReqRes();

    handleTorrent(torrent, req, res);

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        "Content-Type": "video/mp4",
        "Content-Length": 2_000_000,
        "Accept-Ranges": "bytes",
      }),
    );
    expect(file.createReadStream).toHaveBeenCalledWith();
  });

  it("sends 206 Partial Content for a range request", () => {
    const file = makeFakeFile("film.mkv", 5_000_000);
    const torrent = makeTorrent([file]);
    const { req, res } = makeReqRes({ range: "bytes=0-1023" });

    handleTorrent(torrent, req, res);

    expect(res.writeHead).toHaveBeenCalledWith(
      206,
      expect.objectContaining({
        "Content-Type": "video/x-matroska",
        "Content-Range": "bytes 0-1023/5000000",
        "Content-Length": 1024,
      }),
    );
    expect(file.createReadStream).toHaveBeenCalledWith({ start: 0, end: 1023 });
  });

  it("returns 416 for an unsatisfiable range without opening a stream", () => {
    const file = makeFakeFile("film.mp4", 5_000_000);
    const torrent = makeTorrent([file]);
    const { req, res } = makeReqRes({ range: "bytes=5000000-" });

    handleTorrent(torrent, req, res);

    expect(res.writeHead).toHaveBeenCalledWith(
      416,
      expect.objectContaining({
        "Content-Range": "bytes */5000000",
        "Accept-Ranges": "bytes",
      }),
    );
    expect(res.end).toHaveBeenCalled();
    expect(file.createReadStream).not.toHaveBeenCalled();
  });

  it("does not open a stream for a HEAD request", () => {
    const file = makeFakeFile("film.mp4", 5_000_000);
    const torrent = makeTorrent([file]);
    const { req, res } = makeReqRes({ range: "bytes=1000-2000" }, {}, "HEAD");

    handleTorrent(torrent, req, res);

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Length": 5_000_000 }),
    );
    expect(res.end).toHaveBeenCalled();
    expect(file.createReadStream).not.toHaveBeenCalled();
  });

  it("picks the largest file from a multi-file torrent", () => {
    const small = makeFakeFile("subtitle.srt", 10_000);
    const big = makeFakeFile("movie.mp4", 4_000_000_000);
    const torrent = makeTorrent([small, big]);
    const { req, res } = makeReqRes();

    handleTorrent(torrent, req, res);

    expect(big.createReadStream).toHaveBeenCalled();
    expect(small.createReadStream).not.toHaveBeenCalled();
  });

  it("destroys stream on client disconnect", () => {
    const file = makeFakeFile("video.webm", 1_000);
    const torrent = makeTorrent([file]);
    const { req, res } = makeReqRes();
    const fakeStream = makeFakeStream();
    file.createReadStream.mockReturnValue(fakeStream);

    handleTorrent(torrent, req, res);

    // Simulate client closing connection
    const closeHandler = (req.on as any).mock.calls.find(
      ([event]: [string]) => event === "close",
    )[1];
    closeHandler();

    expect(fakeStream.destroy).toHaveBeenCalled();
  });

  it("correctly maps common video MIME types via file extension", () => {
    const cases: [string, string][] = [
      ["movie.mp4", "video/mp4"],
      ["movie.mkv", "video/x-matroska"],
      ["movie.webm", "video/webm"],
      ["movie.avi", "video/x-msvideo"],
      ["movie.mov", "video/quicktime"],
      ["movie.unknown", "video/mp4"], // default fallback
    ];

    for (const [filename, expectedMime] of cases) {
      const file = makeFakeFile(filename, 1_000);
      const torrent = makeTorrent([file]);
      const { req, res } = makeReqRes();

      handleTorrent(torrent, req, res);

      const callArgs = (res.writeHead as any).mock.calls.at(-1);
      expect(callArgs[1]["Content-Type"]).toBe(expectedMime);
    }
  });
});

describe("parseByteRange", () => {
  it("supports open-ended and suffix ranges used while seeking", () => {
    expect(parseByteRange("bytes=1000-", 5_000)).toEqual({
      type: "partial",
      start: 1_000,
      end: 4_999,
      length: 4_000,
    });
    expect(parseByteRange("bytes=-500", 5_000)).toEqual({
      type: "partial",
      start: 4_500,
      end: 4_999,
      length: 500,
    });
  });

  it("clamps an oversized range to the file boundary", () => {
    expect(parseByteRange("bytes=4000-9000", 5_000)).toEqual({
      type: "partial",
      start: 4_000,
      end: 4_999,
      length: 1_000,
    });
  });

  it("ignores unsupported units and multi-range requests", () => {
    expect(parseByteRange("items=0-10", 5_000)).toEqual({
      type: "full",
    });
    expect(parseByteRange("bytes=0-10,20-30", 5_000)).toEqual({
      type: "full",
    });
  });

  it("rejects malformed and out-of-bounds byte ranges", () => {
    expect(parseByteRange("bytes=broken", 5_000)).toEqual({
      type: "unsatisfiable",
    });
    expect(parseByteRange("bytes=5000-", 5_000)).toEqual({
      type: "unsatisfiable",
    });
  });
});

describe("serveTorrentFile", () => {
  it("serves a clamped gateway seek range with exposed response headers", async () => {
    const file = makeFakeFile("film.mp4", 5_000_000);
    const torrent = makeTorrent([file]);
    const { req, res } = makeReqRes({ range: "bytes=4000000-9000000" });

    await serveTorrentFile(req, res, torrent);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Access-Control-Expose-Headers",
      "Accept-Ranges, Content-Length, Content-Range",
    );
    expect(res.status).toHaveBeenCalledWith(206);
    expect(res.set).toHaveBeenCalledWith({
      "Content-Range": "bytes 4000000-4999999/5000000",
      "Content-Length": 1_000_000,
    });
    expect(file.createReadStream).toHaveBeenCalledWith({
      start: 4_000_000,
      end: 4_999_999,
    });
  });

  it("returns 416 for an out-of-bounds gateway seek", async () => {
    const file = makeFakeFile("film.mp4", 5_000_000);
    const torrent = makeTorrent([file]);
    const { req, res } = makeReqRes({ range: "bytes=5000000-" });

    await serveTorrentFile(req, res, torrent);

    expect(res.status).toHaveBeenCalledWith(416);
    expect(res.set).toHaveBeenCalledWith({
      "Content-Range": "bytes */5000000",
    });
    expect(res.end).toHaveBeenCalled();
    expect(file.createReadStream).not.toHaveBeenCalled();
  });

  it("materializes MKV remux output as seekable MP4 for HEAD probes", async () => {
    const remuxedBytes = Buffer.from("0123456789abcdef");
    const spawner = makeSuccessfulFfmpegSpawner(remuxedBytes);
    __setFfmpegSpawnerForTests(spawner);

    const file = makeFakeFile("film.mkv", 5_000_000);
    const torrent = makeTorrent([file]);
    torrent.infoHash = "movie-hash";

    const { req, res } = makeReqRes({}, {}, "HEAD");

    await serveTorrentFile(req, res, torrent);

    expect(spawner).toHaveBeenCalledTimes(1);
    expect(file.createReadStream).toHaveBeenCalledWith();
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "video/mp4");
    expect(res.setHeader).toHaveBeenCalledWith("Accept-Ranges", "bytes");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Access-Control-Expose-Headers",
      "Accept-Ranges, Content-Length, Content-Range",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Length",
      remuxedBytes.length,
    );
    expect(res.end).toHaveBeenCalled();
  });

  it("serves byte ranges from cached remux output without spawning FFmpeg again", async () => {
    const remuxedBytes = Buffer.from("0123456789abcdef");
    const spawner = makeSuccessfulFfmpegSpawner(remuxedBytes);
    __setFfmpegSpawnerForTests(spawner);

    const file = makeFakeFile("film.mkv", 5_000_000);
    const torrent = makeTorrent([file]);
    torrent.infoHash = "movie-hash";

    const warm = makeReqRes({}, {}, "HEAD");
    await serveTorrentFile(warm.req, warm.res, torrent);

    const range = makeReqRes({ range: "bytes=4-7" }, {}, "HEAD");
    await serveTorrentFile(range.req, range.res, torrent);

    expect(spawner).toHaveBeenCalledTimes(1);
    expect(range.res.status).toHaveBeenCalledWith(206);
    expect(range.res.set).toHaveBeenCalledWith({
      "Content-Range": `bytes 4-7/${remuxedBytes.length}`,
      "Content-Length": 4,
    });
    expect(range.res.end).toHaveBeenCalled();
  });
});

describe("getSelectedFile", () => {
  it("uses an explicit file index when one is provided", () => {
    const torrent = makeTorrent([
      makeFakeFile("sample.txt", 100),
      makeFakeFile("episode.mp4", 1_000),
    ]);

    expect(getSelectedFile(torrent, 1).name).toBe("episode.mp4");
  });

  it("throws for a missing explicit file index", () => {
    const torrent = makeTorrent([makeFakeFile("movie.mp4", 1_000)]);

    expect(() => getSelectedFile(torrent, 3)).toThrow(
      "Requested file index 3 is not available",
    );
  });

  it("uses episode hints for the smart fallback when no file index is provided", () => {
    const torrent = makeTorrent([
      makeFakeFile("Show.S01E01.mkv", 1_500_000_000),
      makeFakeFile("Show.S01E02.mkv", 1_500_000_000),
      makeFakeFile("Show.S01E03.mkv", 1_500_000_000),
    ]);

    expect(
      getSelectedFile(torrent, undefined, { season: 1, episode: 2 }).name,
    ).toBe("Show.S01E02.mkv");
  });
});

// ─── waitForReady ─────────────────────────────────────────────────────────────

describe("waitForReady", () => {
  it("resolves immediately when files are already populated", async () => {
    const torrent = makeTorrent([makeFakeFile()]);
    await expect(waitForReady(torrent, 100)).resolves.toBeUndefined();
  });

  it("resolves after the ready event fires", async () => {
    const torrent = makeTorrent([]); // starts empty
    // Emit ready after a short delay, populating files
    setTimeout(() => {
      torrent.files = [makeFakeFile()];
      torrent.emit("ready");
    }, 20);

    await expect(waitForReady(torrent, 1000)).resolves.toBeUndefined();
  });

  it("rejects when the torrent emits an error", async () => {
    const torrent = makeTorrent([]);
    setTimeout(
      () => torrent.emit("error", new Error("Metadata fetch failed")),
      10,
    );

    await expect(waitForReady(torrent, 1000)).rejects.toThrow(
      "Metadata fetch failed",
    );
  });

  it("rejects with a timeout error if ready never fires", async () => {
    const torrent = makeTorrent([]); // never emits ready
    await expect(waitForReady(torrent, 50)).rejects.toThrow(
      "Torrent ready timeout",
    );
  });
});

// ─── selectBestVideoFile ──────────────────────────────────────────────────────

describe("selectBestVideoFile", () => {
  function makeFile(name: string, size: number) {
    return { name, length: size };
  }

  it("returns the single playable video file when there is only one", () => {
    expect(
      selectBestVideoFile([makeFile("movie.mkv", 2_000_000_000)]).name,
    ).toBe("movie.mkv");
  });

  it("picks the main feature for a simple movie torrent", () => {
    const files = [
      makeFile("Movie.Name.2024.mkv", 8_000_000_000),
      makeFile("Movie.Name.2024.srt", 50_000),
      makeFile("cover.jpg", 200_000),
    ];
    expect(selectBestVideoFile(files).name).toBe("Movie.Name.2024.mkv");
  });

  it("excludes sample files and picks the main feature", () => {
    const files = [
      makeFile("Movie.2024.sample.mp4", 50_000_000),
      makeFile("Movie.2024.mkv", 8_000_000_000),
    ];
    expect(selectBestVideoFile(files).name).toBe("Movie.2024.mkv");
  });

  it("excludes trailer files", () => {
    const files = [
      makeFile("Movie.2024.trailer.mp4", 200_000_000),
      makeFile("Movie.2024.mkv", 8_000_000_000),
    ];
    expect(selectBestVideoFile(files).name).toBe("Movie.2024.mkv");
  });

  it("excludes featurette and extra files", () => {
    const files = [
      makeFile("Making.Of.featurette.mkv", 400_000_000),
      makeFile("Behind.The.Scenes.mkv", 300_000_000),
      makeFile("Movie.2024.mkv", 8_000_000_000),
    ];
    expect(selectBestVideoFile(files).name).toBe("Movie.2024.mkv");
  });

  it("excludes subtitle-only files when video files are present", () => {
    const files = [
      makeFile("Episode.S01E01.en.srt", 80_000),
      makeFile("Episode.S01E01.mkv", 1_500_000_000),
    ];
    expect(selectBestVideoFile(files).name).toBe("Episode.S01E01.mkv");
  });

  it("throws when a torrent has no playable video files", () => {
    const files = [
      makeFile("Episode.S01E01.en.srt", 80_000),
      makeFile("Episode.S01E01.nfo", 20_000),
    ];

    expect(() => selectBestVideoFile(files)).toThrow(
      "Torrent has no playable video files",
    );
  });

  it("picks the correct episode using season+episode hints (S01E02 style)", () => {
    const files = [
      makeFile("Show.S01E01.mkv", 1_500_000_000),
      makeFile("Show.S01E02.mkv", 1_500_000_000),
      makeFile("Show.S01E03.mkv", 1_500_000_000),
    ];
    expect(selectBestVideoFile(files, { season: 1, episode: 2 }).name).toBe(
      "Show.S01E02.mkv",
    );
  });

  it("picks the correct episode using 1x02 style hints", () => {
    const files = [
      makeFile("Show.1x01.mkv", 1_500_000_000),
      makeFile("Show.1x02.mkv", 1_500_000_000),
    ];
    expect(selectBestVideoFile(files, { season: 1, episode: 2 }).name).toBe(
      "Show.1x02.mkv",
    );
  });

  it("picks the correct episode using non-padded S1E2 style hints", () => {
    const files = [
      makeFile("Show.S1E1.mkv", 1_500_000_000),
      makeFile("Show.S1E2.mkv", 1_500_000_000),
    ];

    expect(selectBestVideoFile(files, { season: 1, episode: 2 }).name).toBe(
      "Show.S1E2.mkv",
    );
  });

  it("uses title hints as a secondary tiebreaker", () => {
    const files = [
      makeFile("Other.Movie.2024.mkv", 2_000_000_000),
      makeFile("Target.Movie.2024.mkv", 2_000_000_000),
    ];

    expect(selectBestVideoFile(files, { title: "Target Movie" }).name).toBe(
      "Target.Movie.2024.mkv",
    );
  });

  it("falls back to largest when episode hints match nothing", () => {
    const files = [
      makeFile("Show.S01E01.mkv", 1_500_000_000),
      makeFile("Show.S01E03.mkv", 2_000_000_000),
    ];
    // hint for episode 2, which doesn't exist
    expect(selectBestVideoFile(files, { season: 1, episode: 2 }).name).toBe(
      "Show.S01E03.mkv",
    );
  });

  it("falls back to largest when all files are samples/excluded", () => {
    const files = [
      makeFile("sample.mp4", 50_000_000),
      makeFile("trailer.mp4", 80_000_000),
    ];
    // Both are excluded, so it falls back to the pool (largest wins)
    const result = selectBestVideoFile(files);
    expect(["sample.mp4", "trailer.mp4"]).toContain(result.name);
  });

  it("uses size ratio to filter out tiny extras even if they have a video extension", () => {
    const files = [
      makeFile("Movie.2024.mkv", 8_000_000_000),
      makeFile("intro.mp4", 5_000_000), // < 10% of 8 GB
    ];
    expect(selectBestVideoFile(files).name).toBe("Movie.2024.mkv");
  });

  it("throws when the file list is empty", () => {
    expect(() => selectBestVideoFile([])).toThrow(
      "Torrent has no files to select from",
    );
  });
});

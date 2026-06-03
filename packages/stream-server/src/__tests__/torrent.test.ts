/**
 * Unit tests for the torrent stream-server handler.
 *
 * Strategy: import `handleTorrent` and `waitForReady` directly (they are now
 * exported). We avoid mocking the WebTorrent client at module level to
 * prevent ESM singleton state from causing vitest to hang.
 */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "events";
import type { Request, Response } from "express";
import {
  handleTorrent,
  waitForReady,
  selectBestVideoFile,
} from "../torrent-helpers.js";
import { getSelectedFile } from "../torrent.js";

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
) {
  const req = {
    query,
    headers,
    on: vi.fn(),
  } as unknown as Request;

  const res = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    writeHead: vi.fn(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
}

function makeTorrent(files: any[] = []) {
  const t = new EventEmitter() as any;
  t.files = files;
  return t;
}

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

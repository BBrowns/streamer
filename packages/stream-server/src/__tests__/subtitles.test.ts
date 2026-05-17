import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSubtitlesRequest } from "../subtitles.js";
import { EventEmitter } from "events";
import { spawn } from "child_process";
import * as torrentUtils from "../torrent.js";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("../torrent.js", () => ({
  getClient: vi.fn(),
  waitForReady: vi.fn(),
  validateTorrentFiles: vi.fn(),
}));

describe("Subtitle Service", () => {
  let mockRes: any;
  let mockReq: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      get: vi.fn(),
    };
    mockReq = {
      query: { magnet: "magnet:?xt=urn:btih:123" },
      protocol: "http",
      get: vi.fn().mockReturnValue("localhost"),
    };
  });

  it("should detect external subtitle files", async () => {
    const mockFiles = [
      { name: "movie.mp4", length: 1000, streamURL: "/mp4" },
      { name: "subs.srt", length: 10, streamURL: "/srt" },
    ];
    const mockTorrent = { files: mockFiles, get: vi.fn() };
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockTorrent),
      server: { address: () => ({ port: 1234 }) },
    };

    (torrentUtils.getClient as any).mockResolvedValue(mockClient);
    (torrentUtils.waitForReady as any).mockResolvedValue(undefined);

    // Mock ffprobe spawn
    const mockFfprobe = new EventEmitter() as any;
    mockFfprobe.stdout = new EventEmitter();
    (spawn as any).mockReturnValue(mockFfprobe);

    const promise = getSubtitlesRequest(mockReq as any, mockRes as any);

    // Simulate ffprobe empty output
    setTimeout(() => {
      mockFfprobe.stdout.emit("data", JSON.stringify({ streams: [] }));
      mockFfprobe.emit("close");
    }, 10);

    await promise;

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        tracks: expect.arrayContaining([
          expect.objectContaining({ id: "external:1", type: "external" }),
        ]),
      }),
    );
  });

  it("should detect internal subtitle tracks via ffprobe", async () => {
    const mockFiles = [{ name: "movie.mkv", length: 1000, streamURL: "/mkv" }];
    const mockTorrent = { files: mockFiles };
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockTorrent),
      server: { address: () => ({ port: 1234 }) },
    };

    (torrentUtils.getClient as any).mockResolvedValue(mockClient);
    (torrentUtils.waitForReady as any).mockResolvedValue(undefined);

    const mockFfprobe = new EventEmitter() as any;
    mockFfprobe.stdout = new EventEmitter();
    (spawn as any).mockReturnValue(mockFfprobe);

    const promise = getSubtitlesRequest(mockReq as any, mockRes as any);

    setTimeout(() => {
      mockFfprobe.stdout.emit(
        "data",
        JSON.stringify({
          streams: [
            {
              index: 2,
              codec_name: "subrip",
              tags: { language: "eng", title: "English" },
            },
          ],
        }),
      );
      mockFfprobe.emit("close");
    }, 10);

    await promise;

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        tracks: expect.arrayContaining([
          expect.objectContaining({ id: "internal:2", language: "eng" }),
        ]),
      }),
    );
  });
});

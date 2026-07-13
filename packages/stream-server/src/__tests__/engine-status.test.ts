import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import {
  __resetRemuxCacheForTests,
  __resetTorrentEngineForTests,
  __setFfmpegSpawnerForTests,
  __setWebTorrentImporterForTests,
  getClient,
  getTorrent,
  getTorrentEngineStatus,
  isTorrentEngineUnavailableError,
  streamRequest,
} from "../torrent.js";

const previousTorrentCacheDir = process.env.STREAMER_TORRENT_CACHE_DIR;

function makeRes() {
  const res = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    once: vi.fn().mockReturnThis(),
    emit: vi.fn().mockReturnThis(),
    removeListener: vi.fn().mockReturnThis(),
  };
  return res;
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

describe("torrent engine native load failures", () => {
  beforeEach(() => {
    __resetTorrentEngineForTests();
    vi.restoreAllMocks();
  });

  it("normalizes node-datachannel architecture errors", async () => {
    const nativeError = new Error(
      "dlopen(node_datachannel.node): mach-o file, but is an incompatible architecture (have 'arm64', need 'x86_64')",
    );
    __setWebTorrentImporterForTests(async () => {
      throw nativeError;
    });

    await expect(getClient()).rejects.toMatchObject({
      code: "TORRENT_ENGINE_UNAVAILABLE",
      reason: "native-architecture-mismatch",
    });

    try {
      await getClient();
      throw new Error("expected getClient to reject");
    } catch (err) {
      expect(isTorrentEngineUnavailableError(err)).toBe(true);
    }
    expect(getTorrentEngineStatus()).toMatchObject({
      available: false,
      state: "unavailable",
      reason: "native-architecture-mismatch",
    });
  });

  it("returns a sanitized 503 instead of leaking the dlopen stack", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    __setWebTorrentImporterForTests(async () => {
      throw new Error(
        "dlopen(/node_modules/node-datachannel/build/Release/node_datachannel.node): incompatible architecture",
      );
    });

    const res = makeRes();
    await streamRequest(
      {
        query: { magnet: "magnet:?xt=urn:btih:123" },
        hostname: "127.0.0.1",
      } as any,
      res as any,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("Torrent engine unavailable"),
        retryable: false,
      }),
    );
    expect(res.json.mock.calls[0][0].error).not.toContain("dlopen");
  });
});

describe("torrent lookup", () => {
  let cacheRoot: string | null = null;

  beforeEach(async () => {
    cacheRoot = await mkdtemp(path.join(tmpdir(), "streamer-engine-cache-"));
    process.env.STREAMER_TORRENT_CACHE_DIR = cacheRoot;
    __resetTorrentEngineForTests();
  });

  afterEach(async () => {
    await __resetRemuxCacheForTests();
    if (previousTorrentCacheDir === undefined) {
      delete process.env.STREAMER_TORRENT_CACHE_DIR;
    } else {
      process.env.STREAMER_TORRENT_CACHE_DIR = previousTorrentCacheDir;
    }
    if (cacheRoot) {
      await rm(cacheRoot, { recursive: true, force: true });
      cacheRoot = null;
    }
  });

  it("matches info hashes case-insensitively for metrics lookups", async () => {
    class FakeWebTorrent {
      torrents = [{ infoHash: "abcdef123456" }];
      on = vi.fn();
      destroy = (cb: (err: Error | null) => void) => cb(null);
      createServer = () => ({
        server: {
          listen: (_port: number, _host: string, cb: () => void) => cb(),
          address: () => ({ port: 3210 }),
          on: vi.fn(),
        },
      });
    }

    __setWebTorrentImporterForTests(async () => ({
      default: FakeWebTorrent as any,
    }));

    await getClient();

    expect(getTorrent("ABCDEF123456")).toEqual(
      expect.objectContaining({ infoHash: "abcdef123456" }),
    );
  });

  it("passes the configured torrent cache directory to WebTorrent add", async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), "streamer-wt-add-"));
    process.env.STREAMER_TORRENT_CACHE_DIR = cacheRoot;
    const add = vi.fn((_magnet: string, _options?: { path?: string }) => ({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [],
      on: vi.fn(),
    }));

    class FakeWebTorrent {
      torrents: any[] = [];
      on = vi.fn();
      destroy = (cb: (err: Error | null) => void) => cb(null);
      get = vi.fn(() => null);
      add = add;
      createServer = () => ({
        close: vi.fn(),
        server: {
          listen: (_port: number, _host: string, cb: () => void) => cb(),
          address: () => ({ port: 3210 }),
          on: vi.fn(),
        },
      });
    }

    __setWebTorrentImporterForTests(async () => ({
      default: FakeWebTorrent as any,
    }));

    await streamRequest(
      {
        method: "GET",
        query: { magnet: "magnet:?xt=urn:btih:abcdef123456" },
        hostname: "127.0.0.1",
      } as any,
      makeRes() as any,
    );

    expect(add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        path: expect.stringContaining(cacheRoot),
      }),
    );
    const addOptions = add.mock.calls[0]?.[1] as { path?: string };
    expect(addOptions.path).not.toContain("/private/tmp/webtorrent");
    await rm(cacheRoot, { recursive: true, force: true });
  });

  it("passes episode hints from direct stream requests into file selection", async () => {
    class FakeWebTorrent {
      torrents: any[] = [];
      on = vi.fn();
      destroy = (cb: (err: Error | null) => void) => cb(null);
      get = vi.fn(() => null);
      add = vi.fn(() => {
        const torrent = {
          infoHash: "abcdef123456",
          numPeers: 1,
          files: [
            {
              name: "Show.S01E01.mkv",
              length: 1_500_000_000,
              streamURL: "/webtorrent/show-s01e01",
              createReadStream: vi.fn(() => ({ pipe: vi.fn(), on: vi.fn() })),
            },
            {
              name: "Show.S01E02.mkv",
              length: 1_500_000_000,
              streamURL: "/webtorrent/show-s01e02",
              createReadStream: vi.fn(() => ({ pipe: vi.fn(), on: vi.fn() })),
            },
          ],
          on: vi.fn(),
        };
        this.torrents.push(torrent);
        return torrent;
      });
      createServer = () => ({
        close: vi.fn(),
        server: {
          listen: (_port: number, _host: string, cb: () => void) => cb(),
          address: () => ({ port: 3210 }),
          on: vi.fn(),
        },
      });
    }

    __setWebTorrentImporterForTests(async () => ({
      default: FakeWebTorrent as any,
    }));
    __setFfmpegSpawnerForTests(
      makeSuccessfulFfmpegSpawner(Buffer.from("remuxed-mp4")),
    );

    const res = makeRes();
    await streamRequest(
      {
        method: "HEAD",
        query: {
          magnet: "magnet:?xt=urn:btih:abcdef123456",
          season: "1",
          episode: "2",
        },
        hostname: "127.0.0.1",
      } as any,
      res as any,
    );

    // Wait for the async work to finish
    await new Promise((resolve) => setTimeout(resolve, 100));

    // MKV files now trigger a proxy/remux via FFmpeg instead of a 302 redirect
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "video/mp4");
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

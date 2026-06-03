import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetTorrentEngineForTests,
  __setWebTorrentImporterForTests,
  getClient,
  getTorrent,
  getTorrentEngineStatus,
  isTorrentEngineUnavailableError,
  streamRequest,
} from "../torrent.js";

function makeRes() {
  return {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  };
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
  beforeEach(() => {
    __resetTorrentEngineForTests();
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
            },
            {
              name: "Show.S01E02.mkv",
              length: 1_500_000_000,
              streamURL: "/webtorrent/show-s01e02",
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

    const res = makeRes();
    await streamRequest(
      {
        query: {
          magnet: "magnet:?xt=urn:btih:abcdef123456",
          season: "1",
          episode: "2",
        },
        hostname: "127.0.0.1",
      } as any,
      res as any,
    );

    expect(res.redirect).toHaveBeenCalledWith(
      302,
      "http://127.0.0.1:3210/webtorrent/show-s01e02",
    );
  });
});

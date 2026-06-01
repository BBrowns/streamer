import { StreamEngineManager } from "../StreamEngineManager";
import { HLSEngine } from "../HLSEngine";
import { HttpVideoEngine } from "../HttpVideoEngine";
import { TorrentEngine } from "../TorrentEngine";
import type { Stream } from "@streamer/shared";
import { api } from "../../api";
import { useAuthStore } from "../../../stores/authStore";

jest.mock("../../api", () => ({
  api: {
    get: jest.fn(),
  },
}));

describe("StreamEngineManager", () => {
  let manager: StreamEngineManager;

  beforeEach(() => {
    manager = new StreamEngineManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe("resolveEngine", () => {
    it("should resolve HLS engine for .m3u8 URLs", () => {
      const stream: Stream = { url: "https://cdn.example.com/video.m3u8" };
      const engine = manager.resolveEngine(stream);
      expect(engine).not.toBeNull();
      expect(engine?.getEngineType()).toBe("hls");
    });

    it("should resolve HTTP engine for direct http URLs", () => {
      const stream: Stream = { url: "https://cdn.example.com/video.mp4" };
      const engine = manager.resolveEngine(stream);
      expect(engine).not.toBeNull();
      // HLS engine also matches http(s) URLs — it's registered first
      expect(["hls", "http-video"]).toContain(engine?.getEngineType());
    });

    it("should resolve torrent engine for infoHash streams", () => {
      const stream: Stream = {
        url: "",
        infoHash: "abc123def456",
      };
      const engine = manager.resolveEngine(stream);
      expect(engine).not.toBeNull();
      expect(engine?.getEngineType()).toBe("torrent");
    });

    it("should return null for streams with no url or infoHash", () => {
      const stream: Stream = { url: "" };
      const engine = manager.resolveEngine(stream);
      expect(engine).toBeNull();
    });
  });

  describe("getPlaybackUri", () => {
    it("should return the URL for HTTP streams", async () => {
      const stream: Stream = { url: "https://cdn.example.com/video.mp4" };
      const uri = await manager.getPlaybackUri(stream);
      expect(uri).toBe("https://cdn.example.com/video.mp4");
    });

    it("should return empty string for torrent streams (not directly playable)", async () => {
      const stream: Stream = {
        url: "",
        infoHash: "abc123def456",
      };
      const uri = await manager.getPlaybackUri(stream);
      expect(uri).toBe("");
    });

    it("should return null for completely unresolvable streams", async () => {
      const stream: Stream = { url: "" };
      const uri = await manager.getPlaybackUri(stream);
      expect(uri).toBeNull();
    });
  });

  describe("engine priority", () => {
    it("should prefer HLS over HTTP for http(s) URLs", () => {
      const stream: Stream = { url: "https://cdn.example.com/stream.m3u8" };
      const engine = manager.resolveEngine(stream);
      expect(engine?.getEngineType()).toBe("hls");
    });
  });
});

describe("TorrentEngine", () => {
  let engine: TorrentEngine;

  beforeEach(() => {
    (api.get as jest.Mock).mockRejectedValue(new Error("No debrid"));
    global.fetch = jest.fn() as any;
    useAuthStore.setState({ streamServerToken: null });
    engine = new TorrentEngine({} as any);
  });

  afterEach(() => {
    engine.stop();
  });

  it("should claim it can play streams with infoHash", () => {
    const stream: Stream = { url: "", infoHash: "deadbeef" };
    expect(engine.canPlay(stream)).toBe(true);
  });

  it("should NOT claim it can play regular HTTP streams", () => {
    const stream: Stream = { url: "https://example.com/video.mp4" };
    expect(engine.canPlay(stream)).toBe(false);
  });

  it("should return empty string as playback URI (stub)", async () => {
    const stream: Stream = { url: "", infoHash: "deadbeef" };
    const uri = await engine.getPlaybackUri(stream);
    expect(uri).toBe("");
  });

  it("creates a gateway job for local bridge torrent playback", async () => {
    engine = new TorrentEngine({
      activeStrategy: "local",
      bridgeAvailable: true,
      bridgeStatus: "available",
      bridgeUrl: "http://bridge.test",
    } as any);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-1",
          state: "preparing",
          playbackUrl: "/api/gateway/jobs/job-1/stream",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-1",
          state: "ready",
          playbackUrl: "/api/gateway/jobs/job-1/stream",
        }),
      });

    const uri = await engine.getPlaybackUri({
      infoHash: "deadbeef",
      fileIdx: 2,
      behaviorHints: { remuxToMp4: true },
    });

    expect(uri).toBe("http://bridge.test/api/gateway/jobs/job-1/stream");
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "http://bridge.test/api/gateway/jobs",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"remux":"mp4"'),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://bridge.test/api/gateway/jobs/job-1",
      expect.objectContaining({
        headers: {},
      }),
    );
    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain(
      '"fileIdx":2',
    );
  });

  it("returns gateway playback immediately for legacy ready responses", async () => {
    engine = new TorrentEngine({
      activeStrategy: "local",
      bridgeAvailable: true,
      bridgeStatus: "available",
      bridgeUrl: "http://bridge.test",
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        playbackUrl: "/api/gateway/jobs/job-1/stream",
      }),
    });

    const uri = await engine.getPlaybackUri({ infoHash: "deadbeef" });

    expect(uri).toBe("http://bridge.test/api/gateway/jobs/job-1/stream");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends the optional bridge auth token when creating gateway jobs", async () => {
    useAuthStore.setState({ streamServerToken: "pairing-token" });
    engine = new TorrentEngine({
      activeStrategy: "local",
      bridgeAvailable: true,
      bridgeStatus: "available",
      bridgeUrl: "http://bridge.test",
    } as any);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-1",
          state: "preparing",
          playbackUrl: "/api/gateway/jobs/job-1/stream",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-1",
          state: "ready",
          playbackUrl: "/api/gateway/jobs/job-1/stream",
        }),
      });

    await engine.getPlaybackUri({ infoHash: "deadbeef" });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "http://bridge.test/api/gateway/jobs",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer pairing-token",
        }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://bridge.test/api/gateway/jobs/job-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer pairing-token",
        }),
      }),
    );
  });

  it("surfaces gateway job errors before opening the player stream", async () => {
    const bridge = {
      activeStrategy: "local",
      bridgeAvailable: true,
      bridgeStatus: "available",
      bridgeUrl: "http://bridge.test",
    };
    engine = new TorrentEngine(bridge as any);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-1",
          state: "preparing",
          playbackUrl: "/api/gateway/jobs/job-1/stream",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-1",
          state: "error",
          error: "Torrent metadata timed out. No peers found in 2 minutes.",
          playbackUrl: "/api/gateway/jobs/job-1/stream",
        }),
      });

    await expect(
      engine.getPlaybackUri({ infoHash: "deadbeef" }),
    ).rejects.toThrow("No peers found");
    expect(bridge.bridgeStatus).toBe("no-peers");
  });

  it("should identify itself as torrent engine", () => {
    expect(engine.getEngineType()).toBe("torrent");
  });
});

describe("HttpVideoEngine", () => {
  let engine: HttpVideoEngine;

  beforeEach(() => {
    engine = new HttpVideoEngine();
  });

  it("should handle any http(s) URL", () => {
    expect(engine.canPlay({ url: "https://x.com/v.mp4" })).toBe(true);
    expect(engine.canPlay({ url: "http://x.com/v.mkv" })).toBe(true);
  });

  it("should reject non-http URLs", () => {
    expect(engine.canPlay({ url: "" })).toBe(false);
    expect(engine.canPlay({ url: "magnet:?xt=abc" })).toBe(false);
    expect(engine.canPlay({ url: "stremio://foo" })).toBe(false);
  });

  it("should return the URL as-is for playback", async () => {
    const uri = await engine.getPlaybackUri({ url: "https://x.com/v.mp4" });
    expect(uri).toBe("https://x.com/v.mp4");
  });
});

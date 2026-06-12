import { StreamEngineManager, validateBridgeUrl } from "../StreamEngineManager";
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

  describe("detectBridge", () => {
    it("captures torrent engine diagnostics when the bridge runtime is unsupported", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          torrentEngine: {
            available: false,
            reason: "native-architecture-mismatch",
            message: "node-datachannel was installed for another arch",
            processArch: "x64",
            platform: "darwin",
          },
        }),
      }) as any;

      const available = await manager.detectBridge();

      expect(available).toBe(false);
      expect(manager.bridgeStatus).toBe("unsupported");
      expect(manager.getBridgeDiagnostics()).toMatchObject({
        status: "unsupported",
        reason: "native-architecture-mismatch",
        message: "node-datachannel was installed for another arch",
        processArch: "x64",
        platform: "darwin",
      });
    });

    it("preserves bridge self-test and repair guidance from health", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          torrentEngine: {
            available: false,
            reason: "native-architecture-mismatch",
            message: "node-datachannel was installed for another arch",
            processArch: "x64",
            platform: "darwin",
          },
          runtime: {
            nodeArch: "x64",
            nativeArch: "arm64",
            processArch: "x64",
            platform: "darwin",
            architectureMismatch: true,
          },
          selfTest: {
            status: "fail",
            summary: "Bridge runtime self-test found an issue.",
          },
          repair: {
            required: true,
            reason: "native-architecture-mismatch",
            actionLabel: "Repair runtime",
            steps: ["Install matching Node.js", "Restart the desktop app"],
          },
        }),
      }) as any;

      const available = await manager.detectBridge();

      expect(available).toBe(false);
      expect(manager.bridgeStatus).toBe("unsupported");
      expect(manager.getBridgeDiagnostics()).toMatchObject({
        status: "unsupported",
        reason: "native-architecture-mismatch",
        processArch: "x64",
        runtimeArch: "x64",
        nativeArch: "arm64",
        platform: "darwin",
        selfTest: {
          status: "fail",
        },
        repair: {
          required: true,
          actionLabel: "Repair runtime",
        },
      });
    });
  });

  describe("validateBridgeUrl", () => {
    it("allows localhost, Android emulator, and LAN bridge URLs", () => {
      expect(validateBridgeUrl("http://localhost:11470")).toMatchObject({
        ok: true,
      });
      expect(validateBridgeUrl("http://10.0.2.2:11470")).toMatchObject({
        ok: true,
      });
      expect(validateBridgeUrl("http://192.168.1.25:11470")).toMatchObject({
        ok: true,
      });
      expect(validateBridgeUrl("http://[fd00::25]:11470")).toMatchObject({
        ok: true,
      });
    });

    it("rejects public, credentialed, and non-http bridge URLs", () => {
      expect(validateBridgeUrl("https://bridge.example.com")).toMatchObject({
        ok: false,
        reason: "not-local-or-lan",
      });
      expect(validateBridgeUrl("http://user:pass@192.168.1.25")).toMatchObject({
        ok: false,
        reason: "credentials-not-allowed",
      });
      expect(validateBridgeUrl("file:///tmp/bridge")).toMatchObject({
        ok: false,
        reason: "invalid-protocol",
      });
    });

    it("ignores an untrusted configured bridge URL and falls back to local detection", async () => {
      useAuthStore.setState({
        streamServerUrl: "https://bridge.example.com",
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
      }) as any;

      await manager.detectBridge();

      expect(
        jest
          .mocked(global.fetch)
          .mock.calls.every(
            ([url]) => !String(url).includes("bridge.example.com"),
          ),
      ).toBe(true);
      expect(manager.getBridgeDiagnostics()).toMatchObject({
        status: expect.any(String),
      });
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
      fileSelectionHints: {
        season: 1,
        episode: 2,
        title: "Show Name",
      },
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
    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain(
      '"fileSelectionHints":{"season":1,"episode":2,"title":"Show Name"}',
    );
  });

  it("emits gateway progress and cancels the active gateway job on stop", async () => {
    engine = new TorrentEngine({
      activeStrategy: "local",
      bridgeAvailable: true,
      bridgeStatus: "available",
      bridgeUrl: "http://bridge.test",
    } as any);
    const onGateway = jest.fn();
    engine.on("gateway", onGateway);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-1",
          state: "preparing",
          phase: "preparing_metadata",
          progress: 0.25,
          peerCount: 2,
          playbackUrl: "/api/gateway/jobs/job-1/stream",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-1",
          state: "ready",
          phase: "ready",
          progress: 1,
          playbackUrl: "/api/gateway/jobs/job-1/stream",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-1",
          state: "cancelled",
        }),
      });

    const uri = await engine.getPlaybackUri({ infoHash: "deadbeef" });
    engine.stop();

    expect(uri).toBe("http://bridge.test/api/gateway/jobs/job-1/stream");
    expect(onGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "preparing",
        phase: "creating_gateway_job",
        progress: 0,
      }),
    );
    expect(onGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "preparing",
        phase: "preparing_metadata",
        progress: 0.25,
      }),
    );
    expect(onGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "ready",
        phase: "ready",
        progress: 1,
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "http://bridge.test/api/gateway/jobs/job-1",
      expect.objectContaining({
        method: "DELETE",
        headers: {},
      }),
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

  it("preserves signed gateway stream query params when building the playback URI", async () => {
    engine = new TorrentEngine({
      activeStrategy: "local",
      bridgeAvailable: true,
      bridgeStatus: "available",
      bridgeUrl: "http://bridge.test",
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        playbackUrl:
          "/api/gateway/jobs/job-1/stream?expires=123&signature=signed",
      }),
    });

    const uri = await engine.getPlaybackUri({ infoHash: "deadbeef" });

    expect(uri).toBe(
      "http://bridge.test/api/gateway/jobs/job-1/stream?expires=123&signature=signed",
    );
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

  it("maps explicit gateway no_peers status to the local bridge no-peers state", async () => {
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
          state: "no_peers",
          phase: "no_peers",
          error: "Torrent metadata timed out. No peers found in 2 minutes.",
          retryable: true,
          playbackUrl: null,
        }),
      });

    await expect(
      engine.getPlaybackUri({ infoHash: "deadbeef" }),
    ).rejects.toThrow("No peers found");
    expect(bridge.bridgeStatus).toBe("no-peers");
  });

  it("surfaces stalled gateway status without marking the bridge as no-peers", async () => {
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
          state: "stalled",
          phase: "stalled",
          error: "Gateway job stalled while checking piece availability.",
          retryable: true,
          playbackUrl: null,
        }),
      });

    await expect(
      engine.getPlaybackUri({ infoHash: "deadbeef" }),
    ).rejects.toThrow("stalled");
    expect(bridge.bridgeStatus).toBe("available");
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

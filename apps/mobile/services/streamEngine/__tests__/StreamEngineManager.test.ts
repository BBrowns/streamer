import { StreamEngineManager, validateBridgeUrl } from "../StreamEngineManager";
import { HLSEngine } from "../HLSEngine";
import { HttpVideoEngine } from "../HttpVideoEngine";
import { TorrentEngine } from "../TorrentEngine";
import { StreamEngineCancellationError } from "../IStreamEngine";
import type { Stream } from "@streamer/shared";
import { api } from "../../api";
import { useAuthStore } from "../../../stores/authStore";

jest.mock("../../api", () => ({
  api: {
    get: jest.fn(),
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitForFetchCallCount(count: number) {
  for (
    let attempt = 0;
    attempt < 30 && (global.fetch as jest.Mock).mock.calls.length < count;
    attempt += 1
  ) {
    await Promise.resolve();
  }
  expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(
    count,
  );
}

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
      behaviorHints: {
        remuxToMp4: true,
        remuxStrategy: "progressive-fmp4",
      },
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
    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain(
      '"remuxStrategy":"progressive-fmp4"',
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
          progress: null,
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
        progress: null,
      }),
    );
    expect(onGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "preparing",
        phase: "preparing_metadata",
        progress: null,
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

  it("waits through remuxing gateway progress before returning the playback URI", async () => {
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
          progress: null,
          playbackUrl: "/api/gateway/jobs/job-1/stream",
          readyTimeoutMs: 92000,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-1",
          state: "preparing",
          phase: "remuxing",
          progress: null,
          playbackUrl: "/api/gateway/jobs/job-1/stream",
          media: {
            remuxed: true,
            seekable: false,
            cacheStatus: "pending",
          },
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
          media: {
            remuxed: true,
            seekable: true,
            cacheStatus: "ready",
          },
        }),
      });

    const uri = await engine.getPlaybackUri({
      infoHash: "deadbeef",
      behaviorHints: { remuxToMp4: true },
    });

    expect(uri).toBe("http://bridge.test/api/gateway/jobs/job-1/stream");
    expect(onGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "preparing",
        phase: "remuxing",
        progress: null,
      }),
    );
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("extends a generic gateway job deadline when metadata reveals an MKV remux", async () => {
    jest.useFakeTimers();
    try {
      engine = new TorrentEngine({
        activeStrategy: "local",
        bridgeAvailable: true,
        bridgeStatus: "available",
        bridgeUrl: "http://bridge.test",
      } as any);
      // Deliberately use a bridge wall clock far from the client clock. The
      // client must use the bridge's relative elapsed duration, not this
      // timestamp, when it extends a gateway deadline.
      const createdAt = new Date(Date.now() - 10 * 60_000).toISOString();
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "job-1",
            state: "preparing",
            phase: "preparing_metadata",
            playbackUrl: "/api/gateway/jobs/job-1/stream",
            readyTimeoutMs: 1_000,
            createdAt,
            elapsedMs: 0,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "job-1",
            state: "preparing",
            phase: "remuxing",
            playbackUrl: "/api/gateway/jobs/job-1/stream",
            readyTimeoutMs: 8_000,
            createdAt,
            elapsedMs: 100,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "job-1",
            state: "preparing",
            phase: "remuxing",
            playbackUrl: "/api/gateway/jobs/job-1/stream",
            readyTimeoutMs: 8_000,
            createdAt,
            elapsedMs: 1_100,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "job-1",
            state: "preparing",
            phase: "remuxing",
            playbackUrl: "/api/gateway/jobs/job-1/stream",
            readyTimeoutMs: 8_000,
            createdAt,
            elapsedMs: 2_100,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "job-1",
            state: "ready",
            phase: "ready",
            playbackUrl: "/api/gateway/jobs/job-1/stream",
            readyTimeoutMs: 8_000,
            createdAt,
            elapsedMs: 3_100,
          }),
        });

      const playback = engine.getPlaybackUri({ infoHash: "deadbeef" });
      await waitForFetchCallCount(2);
      await jest.advanceTimersByTimeAsync(3_100);

      await expect(playback).resolves.toBe(
        "http://bridge.test/api/gateway/jobs/job-1/stream",
      );
      expect(global.fetch).toHaveBeenCalledTimes(5);
    } finally {
      jest.useRealTimers();
    }
  });

  it("ends a gateway wait from relative elapsed time when the bridge clock is ahead", async () => {
    jest.useFakeTimers();
    try {
      engine = new TorrentEngine({
        activeStrategy: "local",
        bridgeAvailable: true,
        bridgeStatus: "available",
        bridgeUrl: "http://bridge.test",
      } as any);
      const createdAt = new Date(Date.now() + 10 * 60_000).toISOString();
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "job-1",
            state: "preparing",
            phase: "finding_peers",
            playbackUrl: "/api/gateway/jobs/job-1/stream",
            readyTimeoutMs: 1_000,
            createdAt,
            elapsedMs: 0,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "job-1",
            state: "preparing",
            phase: "finding_peers",
            playbackUrl: "/api/gateway/jobs/job-1/stream",
            readyTimeoutMs: 1_000,
            createdAt,
            elapsedMs: 0,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "job-1",
            state: "preparing",
            phase: "finding_peers",
            playbackUrl: "/api/gateway/jobs/job-1/stream",
            readyTimeoutMs: 1_000,
            createdAt,
            elapsedMs: 1_000,
          }),
        })
        .mockResolvedValue({ ok: false, json: async () => ({}) });

      const playback = engine.getPlaybackUri({ infoHash: "deadbeef" });
      const expectedFailure = expect(playback).rejects.toThrow(
        "Still waiting for torrent peers",
      );
      await waitForFetchCallCount(2);
      await jest.advanceTimersByTimeAsync(2_100);

      await expectedFailure;
      expect(
        (global.fetch as jest.Mock).mock.calls.some(
          ([, options]) => options?.method === "DELETE",
        ),
      ).toBe(true);
    } finally {
      jest.useRealTimers();
    }
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
          error: "No peers found quickly enough to start this source.",
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
          error: "No peers found quickly enough to start this source.",
          retryable: true,
          playbackUrl: null,
        }),
      });

    await expect(
      engine.getPlaybackUri({ infoHash: "deadbeef" }),
    ).rejects.toThrow("No peers found");
    expect(bridge.bridgeStatus).toBe("no-peers");
  });

  it("starts a new local gateway job for the next source after a no-peers result", async () => {
    const bridge = {
      activeStrategy: "local",
      bridgeAvailable: true,
      bridgeStatus: "available",
      bridgeUrl: "http://bridge.test",
    };
    engine = new TorrentEngine(bridge as any);

    (global.fetch as jest.Mock).mockImplementation(
      (url: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }

        if (init?.method === "POST") {
          const jobId =
            (global.fetch as jest.Mock).mock.calls.filter(
              ([, requestInit]) => requestInit?.method === "POST",
            ).length === 1
              ? "job-without-peers"
              : "job-with-peers";
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: jobId,
              state: "preparing",
              playbackUrl: `/api/gateway/jobs/${jobId}/stream`,
            }),
          });
        }

        if (url.endsWith("/job-without-peers")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: "job-without-peers",
              state: "no_peers",
              error: "No peers found for this source.",
            }),
          });
        }

        if (url.endsWith("/job-with-peers")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: "job-with-peers",
              state: "ready",
              playbackUrl: "/api/gateway/jobs/job-with-peers/stream",
            }),
          });
        }

        throw new Error(`Unexpected gateway request: ${url}`);
      },
    );

    await expect(
      engine.getPlaybackUri({ infoHash: "source-without-peers" }),
    ).rejects.toThrow("No peers found");
    expect(bridge.bridgeStatus).toBe("no-peers");

    await expect(
      engine.getPlaybackUri({ infoHash: "source-with-peers" }),
    ).resolves.toBe(
      "http://bridge.test/api/gateway/jobs/job-with-peers/stream",
    );
    expect(bridge.bridgeStatus).toBe("available");

    expect(
      (global.fetch as jest.Mock).mock.calls.filter(
        ([, init]) => init?.method === "POST",
      ),
    ).toHaveLength(2);
  });

  it.each(["unreachable", "unsupported"])(
    "does not start a local gateway job while the bridge is %s",
    async (bridgeStatus) => {
      engine = new TorrentEngine({
        activeStrategy: "local",
        bridgeAvailable: true,
        bridgeStatus,
        bridgeUrl: "http://bridge.test",
      } as any);

      await expect(
        engine.getPlaybackUri({ infoHash: "deadbeef" }),
      ).resolves.toBe("");

      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

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

  it("cancels immediately during gateway creation and deletes a job returned late", async () => {
    const bridge = {
      activeStrategy: "local",
      bridgeAvailable: true,
      bridgeStatus: "available",
      bridgeUrl: "http://bridge.test",
    };
    engine = new TorrentEngine(bridge);
    const postResponse = createDeferred<any>();
    const onGateway = jest.fn();
    engine.on("gateway", onGateway);
    (global.fetch as jest.Mock).mockImplementation(
      (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") return postResponse.promise;
        if (init?.method === "DELETE") {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        throw new Error("Unexpected gateway request");
      },
    );

    const playback = engine.getPlaybackUri({ infoHash: "deadbeef" });
    await waitForFetchCallCount(1);
    const postSignal = (global.fetch as jest.Mock).mock.calls[0][1]
      .signal as AbortSignal;

    engine.stop();

    expect(postSignal.aborted).toBe(true);
    await expect(playback).rejects.toBeInstanceOf(
      StreamEngineCancellationError,
    );
    expect(bridge.bridgeStatus).toBe("available");
    expect(onGateway).not.toHaveBeenCalledWith(
      expect.objectContaining({ state: "error" }),
    );

    postResponse.resolve({
      ok: true,
      json: async () => ({
        id: "late-job",
        state: "preparing",
        playbackUrl: "/api/gateway/jobs/late-job/stream",
      }),
    });
    await waitForFetchCallCount(2);

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://bridge.test/api/gateway/jobs/late-job",
      expect.objectContaining({ method: "DELETE" }),
    );
    engine.stop();
    await Promise.resolve();
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(
        ([, init]) => init?.method === "DELETE",
      ),
    ).toHaveLength(1);
  });

  it("cancels an in-flight gateway status poll without accepting its late result", async () => {
    const bridge = {
      activeStrategy: "local",
      bridgeAvailable: true,
      bridgeStatus: "available",
      bridgeUrl: "http://bridge.test",
    };
    engine = new TorrentEngine(bridge);
    const pollResponse = createDeferred<any>();
    const onGateway = jest.fn();
    engine.on("gateway", onGateway);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "job-1",
          state: "preparing",
          playbackUrl: "/api/gateway/jobs/job-1/stream",
        }),
      })
      .mockImplementationOnce(() => pollResponse.promise)
      .mockResolvedValue({ ok: true, json: async () => ({}) });

    const playback = engine.getPlaybackUri({ infoHash: "deadbeef" });
    await waitForFetchCallCount(2);
    const pollSignal = (global.fetch as jest.Mock).mock.calls[1][1]
      .signal as AbortSignal;

    engine.stop();

    expect(pollSignal.aborted).toBe(true);
    await expect(playback).rejects.toBeInstanceOf(
      StreamEngineCancellationError,
    );
    pollResponse.resolve({
      ok: true,
      json: async () => ({
        id: "job-1",
        state: "ready",
        playbackUrl: "/api/gateway/jobs/job-1/stream",
      }),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(onGateway).not.toHaveBeenCalledWith(
      expect.objectContaining({ state: "ready" }),
    );
    expect(bridge.bridgeStatus).toBe("available");
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(
        ([, init]) => init?.method === "DELETE",
      ),
    ).toHaveLength(1);
  });

  it("cancels the polling delay without waiting for its timer", async () => {
    jest.useFakeTimers();
    try {
      engine = new TorrentEngine({
        activeStrategy: "local",
        bridgeAvailable: true,
        bridgeStatus: "available",
        bridgeUrl: "http://bridge.test",
      });
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
            state: "preparing",
            phase: "finding_peers",
            playbackUrl: "/api/gateway/jobs/job-1/stream",
          }),
        })
        .mockResolvedValue({ ok: true, json: async () => ({}) });

      const playback = engine.getPlaybackUri({ infoHash: "deadbeef" });
      await waitForFetchCallCount(2);

      engine.stop();

      await expect(playback).rejects.toBeInstanceOf(
        StreamEngineCancellationError,
      );
      expect(jest.getTimerCount()).toBe(0);
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(global.fetch).toHaveBeenNthCalledWith(
        3,
        "http://bridge.test/api/gateway/jobs/job-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    } finally {
      jest.useRealTimers();
    }
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

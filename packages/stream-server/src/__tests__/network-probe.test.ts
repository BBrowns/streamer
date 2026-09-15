import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const torrentMocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  normalizeTorrentMagnetForRuntime: vi.fn((value: string) => value),
}));
const readinessMocks = vi.hoisted(() => ({
  waitForReady: vi.fn(),
}));

vi.mock("../torrent.js", () => torrentMocks);
vi.mock("../torrent-helpers.js", () => readinessMocks);
vi.mock("../sentry.js", () => ({
  addStreamServerBreadcrumb: vi.fn(),
}));

import {
  __resetTorrentNetworkProbeForTests,
  isTorrentNetworkProbeConfigured,
  runTorrentNetworkProbe,
} from "../network-probe.js";

const MAGNET = "magnet:?xt=urn:btih:0123456789012345678901234567890123456789";

function createTorrent() {
  const torrent = new EventEmitter() as EventEmitter & {
    files: any[];
    numPeers: number;
    destroyed: boolean;
    destroy: (callback?: () => void) => void;
  };
  torrent.files = [
    {
      createReadStream: () => {
        const stream = new EventEmitter() as EventEmitter & {
          destroy: () => void;
        };
        stream.destroy = () => undefined;
        queueMicrotask(() => stream.emit("data", Buffer.from("probe")));
        return stream;
      },
    },
  ];
  torrent.numPeers = 1;
  torrent.destroyed = false;
  torrent.destroy = (callback) => {
    torrent.destroyed = true;
    callback?.();
  };
  return torrent;
}

describe("torrent network probe", () => {
  beforeEach(() => {
    process.env.STREAMER_TORRENT_NETWORK_PROBE_MAGNET = MAGNET;
    __resetTorrentNetworkProbeForTests();
    torrentMocks.getClient.mockReset();
    torrentMocks.normalizeTorrentMagnetForRuntime.mockImplementation(
      (value: string) => value,
    );
    readinessMocks.waitForReady.mockImplementation(
      async (
        _torrent: unknown,
        _timeout: number,
        options: { onMetadata?: () => void },
      ) => {
        options.onMetadata?.();
      },
    );
  });

  afterEach(() => {
    delete process.env.STREAMER_TORRENT_NETWORK_PROBE_MAGNET;
    __resetTorrentNetworkProbeForTests();
  });

  it("is disabled when no server-owned probe magnet is configured", async () => {
    delete process.env.STREAMER_TORRENT_NETWORK_PROBE_MAGNET;

    expect(isTorrentNetworkProbeConfigured()).toBe(false);
    await expect(runTorrentNetworkProbe()).resolves.toMatchObject({
      status: "unknown",
      failureCode: "UNSUPPORTED",
    });
    expect(torrentMocks.getClient).not.toHaveBeenCalled();
  });

  it("passes after metadata and a first byte without exposing source data", async () => {
    const torrent = createTorrent();
    const client = {
      get: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(() => torrent),
    };
    torrentMocks.getClient.mockResolvedValue(client);

    const result = await runTorrentNetworkProbe();

    expect(result).toMatchObject({
      status: "passed",
      phase: "complete",
      peerCount: 1,
    });
    expect(torrent.destroyed).toBe(true);
    expect(JSON.stringify(result)).not.toContain(MAGNET);
  });

  it("shares one in-flight probe and does not start a second torrent", async () => {
    const torrent = createTorrent();
    let resolveClient!: (value: unknown) => void;
    const clientPromise = new Promise((resolve) => {
      resolveClient = resolve;
    });
    torrentMocks.getClient.mockReturnValue(clientPromise);

    const first = runTorrentNetworkProbe();
    const second = runTorrentNetworkProbe();
    resolveClient({
      get: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(() => torrent),
    });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(torrentMocks.getClient).toHaveBeenCalledTimes(1);
  });

  it("requires two matching failures before returning blocked", async () => {
    const torrent = createTorrent();
    torrent.numPeers = 0;
    torrentMocks.getClient.mockResolvedValue({
      get: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(() => torrent),
    });

    readinessMocks.waitForReady.mockRejectedValue(
      new Error("Torrent peer discovery timeout"),
    );

    await expect(runTorrentNetworkProbe()).resolves.toMatchObject({
      status: "degraded",
      failureCode: "NO_PEERS",
    });
    await expect(runTorrentNetworkProbe()).resolves.toMatchObject({
      status: "blocked",
      failureCode: "NO_PEERS",
    });
  });

  it("classifies bridge startup failures separately from torrent failures", async () => {
    torrentMocks.getClient.mockRejectedValue(new Error("bridge unavailable"));

    await expect(runTorrentNetworkProbe()).resolves.toMatchObject({
      status: "degraded",
      phase: "bridge",
      failureCode: "BRIDGE_UNAVAILABLE",
    });
  });

  it("aborts the shared probe when its last consumer cancels", async () => {
    const torrent = createTorrent();
    torrentMocks.getClient.mockResolvedValue({
      get: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(() => torrent),
    });
    readinessMocks.waitForReady.mockImplementation(
      async (
        _torrent: unknown,
        _timeout: number,
        options: { signal?: AbortSignal },
      ) =>
        new Promise<void>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true },
          );
        }),
    );

    const controller = new AbortController();
    const probe = runTorrentNetworkProbe(controller.signal);
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();

    await expect(probe).rejects.toMatchObject({ name: "AbortError" });
    expect(torrent.destroyed).toBe(true);
  });
});

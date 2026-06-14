import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { EventEmitter } from "events";
import { createStreamServerApp } from "../index.js";
import {
  __resetRemuxCacheForTests,
  __resetTorrentEngineForTests,
  __setFfmpegSpawnerForTests,
  __setWebTorrentImporterForTests,
} from "../torrent.js";

const previousBridgeOwner = process.env.STREAMER_BRIDGE_OWNER;
const previousRuntimeArch = process.env.STREAMER_BRIDGE_RUNTIME_ARCH;
const previousNativeArch = process.env.STREAMER_BRIDGE_NATIVE_ARCH;
const previousFfmpegPath = process.env.STREAMER_FFMPEG_PATH;
const previousRemuxCacheMaxBytes = process.env.STREAMER_REMUX_CACHE_MAX_BYTES;

function makeSuccessfulFfmpegVersionSpawner() {
  return ((_command: string, _args: string[]) => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => undefined;

    setTimeout(() => {
      child.stdout.emit("data", Buffer.from("ffmpeg version 6.1.1"));
      child.emit("close", 0);
    }, 0);

    return child;
  }) as any;
}

describe("bridge health", () => {
  afterEach(async () => {
    if (previousBridgeOwner === undefined) {
      delete process.env.STREAMER_BRIDGE_OWNER;
    } else {
      process.env.STREAMER_BRIDGE_OWNER = previousBridgeOwner;
    }

    if (previousRuntimeArch === undefined) {
      delete process.env.STREAMER_BRIDGE_RUNTIME_ARCH;
    } else {
      process.env.STREAMER_BRIDGE_RUNTIME_ARCH = previousRuntimeArch;
    }

    if (previousNativeArch === undefined) {
      delete process.env.STREAMER_BRIDGE_NATIVE_ARCH;
    } else {
      process.env.STREAMER_BRIDGE_NATIVE_ARCH = previousNativeArch;
    }

    if (previousFfmpegPath === undefined) {
      delete process.env.STREAMER_FFMPEG_PATH;
    } else {
      process.env.STREAMER_FFMPEG_PATH = previousFfmpegPath;
    }

    if (previousRemuxCacheMaxBytes === undefined) {
      delete process.env.STREAMER_REMUX_CACHE_MAX_BYTES;
    } else {
      process.env.STREAMER_REMUX_CACHE_MAX_BYTES = previousRemuxCacheMaxBytes;
    }

    __resetTorrentEngineForTests();
    await __resetRemuxCacheForTests();
  });

  it("reports bridge owner, runtime architecture, and a passing self-test", async () => {
    process.env.STREAMER_BRIDGE_OWNER = "desktop";
    process.env.STREAMER_BRIDGE_RUNTIME_ARCH = "arm64";
    process.env.STREAMER_BRIDGE_NATIVE_ARCH = "arm64";
    __setFfmpegSpawnerForTests(makeSuccessfulFfmpegVersionSpawner());
    __setWebTorrentImporterForTests(async () => ({
      default: class FakeWebTorrent {
        torrents: unknown[] = [];
        on = () => undefined;
        createServer = () => ({
          server: {
            listen: (_port: number, _host: string, cb: () => void) => cb(),
            address: () => ({ port: 3210 }),
            on: () => undefined,
          },
        });
      },
    }));

    const res = await request(createStreamServerApp()).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.runtime).toMatchObject({
      owner: "desktop",
      nodeArch: "arm64",
      nativeArch: "arm64",
      processArch: process.arch,
      platform: process.platform,
      architectureMismatch: false,
    });
    expect(res.body.build).toMatchObject({
      runtimeType: "stream-server",
    });
    expect(res.body.version).toBe(res.body.build.appVersion);
    expect(res.body.selfTest).toMatchObject({
      status: "pass",
      summary: "Bridge runtime self-test passed.",
    });
    expect(res.body.repair).toMatchObject({
      required: false,
    });
  });

  it("surfaces native architecture mismatch repair guidance", async () => {
    process.env.STREAMER_BRIDGE_OWNER = "desktop";
    process.env.STREAMER_BRIDGE_RUNTIME_ARCH = "x64";
    process.env.STREAMER_BRIDGE_NATIVE_ARCH = "arm64";
    __setFfmpegSpawnerForTests(makeSuccessfulFfmpegVersionSpawner());
    __setWebTorrentImporterForTests(async () => {
      throw new Error(
        "node_datachannel.node: incompatible architecture; have x86_64, need arm64",
      );
    });

    const res = await request(createStreamServerApp()).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.runtime).toMatchObject({
      owner: "desktop",
      nodeArch: "x64",
      nativeArch: "arm64",
      architectureMismatch: true,
    });
    expect(res.body.torrentEngine).toMatchObject({
      available: false,
      reason: "native-architecture-mismatch",
    });
    expect(res.body.selfTest).toMatchObject({
      status: "fail",
    });
    expect(res.body.repair).toMatchObject({
      required: true,
      reason: "native-architecture-mismatch",
      actionLabel: "Repair runtime",
    });
    expect(res.body.repair.steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Node.js runtime"),
        expect.stringContaining("Restart the desktop app"),
      ]),
    );
  });

  it("reports FFmpeg runtime and remux cache diagnostics", async () => {
    process.env.STREAMER_FFMPEG_PATH = "/opt/streamer/bin/ffmpeg";
    process.env.STREAMER_REMUX_CACHE_MAX_BYTES = "1048576";
    __setFfmpegSpawnerForTests(makeSuccessfulFfmpegVersionSpawner());
    __setWebTorrentImporterForTests(async () => ({
      default: class FakeWebTorrent {
        torrents: unknown[] = [];
        on = () => undefined;
        createServer = () => ({
          server: {
            listen: (_port: number, _host: string, cb: () => void) => cb(),
            address: () => ({ port: 3210 }),
            on: () => undefined,
          },
        });
      },
    }));

    const res = await request(createStreamServerApp()).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.remuxRuntime).toMatchObject({
      available: true,
      state: "ready",
      binaryPath: "/opt/streamer/bin/ffmpeg",
      version: "ffmpeg version 6.1.1",
    });
    expect(res.body.remuxCache).toMatchObject({
      maxBytes: 1_048_576,
      entryCount: 0,
      totalBytes: 0,
    });
    expect(res.body.selfTest.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "ffmpeg-remux",
          status: "pass",
        }),
        expect.objectContaining({
          name: "gateway-readiness",
          status: "pass",
          details: expect.objectContaining({
            remuxReadiness: "cache-before-ready",
            bridgeReadiness: "first-byte-before-ready",
          }),
        }),
      ]),
    );
  });
});

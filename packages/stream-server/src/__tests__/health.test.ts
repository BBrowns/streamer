import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createStreamServerApp } from "../index.js";
import {
  __resetTorrentEngineForTests,
  __setWebTorrentImporterForTests,
} from "../torrent.js";

const previousBridgeOwner = process.env.STREAMER_BRIDGE_OWNER;
const previousRuntimeArch = process.env.STREAMER_BRIDGE_RUNTIME_ARCH;
const previousNativeArch = process.env.STREAMER_BRIDGE_NATIVE_ARCH;

describe("bridge health", () => {
  afterEach(() => {
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

    __resetTorrentEngineForTests();
  });

  it("reports bridge owner, runtime architecture, and a passing self-test", async () => {
    process.env.STREAMER_BRIDGE_OWNER = "desktop";
    process.env.STREAMER_BRIDGE_RUNTIME_ARCH = "arm64";
    process.env.STREAMER_BRIDGE_NATIVE_ARCH = "arm64";
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
});

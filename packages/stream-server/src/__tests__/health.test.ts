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

  it("reports bridge owner and runtime architecture", async () => {
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
    });
  });
});

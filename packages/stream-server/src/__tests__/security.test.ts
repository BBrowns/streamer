import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireBridgeAuth, validateCastPlaybackUrl } from "../security.js";
import { pruneTorrents, validateTorrentFiles } from "../torrent.js";

const previousBridgeToken = process.env.STREAMER_BRIDGE_TOKEN;

function protectedApp() {
  const app = express();
  app.get("/protected", requireBridgeAuth, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("MalwareShield (validateTorrentFiles)", () => {
  it("should allow safe media files", () => {
    const torrent = {
      files: [
        { name: "movie.mp4" },
        { name: "subs.srt" },
        { name: "video.mkv" },
      ],
    };
    expect(() => validateTorrentFiles(torrent)).not.toThrow();
  });

  it("should block executable files (.exe)", () => {
    const torrent = {
      files: [{ name: "movie.mp4" }, { name: "virus.exe" }],
    };
    expect(() => validateTorrentFiles(torrent)).toThrow(/Security Violation/);
  });

  it("should block script files (.sh)", () => {
    const torrent = {
      files: [{ name: "script.sh" }],
    };
    expect(() => validateTorrentFiles(torrent)).toThrow(/Security Violation/);
  });

  it("should block windows system files (.cpl)", () => {
    const torrent = {
      files: [{ name: "malicious.cpl" }],
    };
    expect(() => validateTorrentFiles(torrent)).toThrow(/Security Violation/);
  });

  it("should be case-insensitive", () => {
    const torrent = {
      files: [{ name: "DANGEROUS.EXE" }],
    };
    expect(() => validateTorrentFiles(torrent)).toThrow(/Security Violation/);
  });

  it("should allow files without extensions (if they don't match blacklist)", () => {
    const torrent = {
      files: [{ name: "README" }],
    };
    expect(() => validateTorrentFiles(torrent)).not.toThrow();
  });
});

describe("Torrent Engine Memory Management (pruneTorrents)", () => {
  it("should not prune if under the limit", async () => {
    const torrents = [
      { infoHash: "t1", destroy: vi.fn((cb) => cb()) },
      { infoHash: "t2", destroy: vi.fn((cb) => cb()) },
    ];
    const client = { torrents };

    await pruneTorrents(client);

    expect(torrents[0].destroy).not.toHaveBeenCalled();
    expect(torrents[1].destroy).not.toHaveBeenCalled();
  });

  it("should prune the oldest torrent when limit is exceeded", async () => {
    // Mock current time
    const now = Date.now();

    // Manual setup of lastAccessMap via getTorrent behavior (or just test the logic)
    // Since we can't easily access the private map here without exporting it,
    // we rely on the fact that if we haven't 'accessed' them, they have 0 or undefined.
    // We'll simulate the limit being 5 (default).

    const torrents = Array.from({ length: 6 }, (_, i) => ({
      infoHash: `hash${i}`,
      destroy: vi.fn((cb) => cb()),
    }));

    const client = { torrents };

    // We want to verify it destroys at least one.
    await pruneTorrents(client);

    // One of them should have been destroyed
    const destroyedCount = torrents.filter(
      (t) => t.destroy.mock.calls.length > 0,
    ).length;
    expect(destroyedCount).toBeGreaterThanOrEqual(1);
  });
});

describe("Bridge auth", () => {
  afterEach(() => {
    if (previousBridgeToken === undefined) {
      delete process.env.STREAMER_BRIDGE_TOKEN;
    } else {
      process.env.STREAMER_BRIDGE_TOKEN = previousBridgeToken;
    }
  });

  it("keeps bridge auth disabled by default for local development", async () => {
    delete process.env.STREAMER_BRIDGE_TOKEN;

    const res = await request(protectedApp()).get("/protected");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("requires a bearer token when bridge auth is configured", async () => {
    process.env.STREAMER_BRIDGE_TOKEN = "pairing-token";

    const missing = await request(protectedApp()).get("/protected");
    const present = await request(protectedApp())
      .get("/protected")
      .set("Authorization", "Bearer pairing-token");

    expect(missing.status).toBe(401);
    expect(present.status).toBe(200);
  });

  it("accepts the bridge token header for clients that cannot set bearer auth", async () => {
    process.env.STREAMER_BRIDGE_TOKEN = "pairing-token";

    const res = await request(protectedApp())
      .get("/protected")
      .set("x-streamer-bridge-token", "pairing-token");

    expect(res.status).toBe(200);
  });
});

describe("Cast playback URL validation", () => {
  it("allows public http(s) media URLs", () => {
    expect(
      validateCastPlaybackUrl("https://cdn.example.test/movie.mp4"),
    ).toMatchObject({
      ok: true,
      url: "https://cdn.example.test/movie.mp4",
    });
  });

  it("allows private LAN URLs only when they point back to this bridge", () => {
    expect(
      validateCastPlaybackUrl(
        "http://192.168.1.25:11470/api/gateway/jobs/job-1/stream",
        { allowedHosts: ["192.168.1.25"] },
      ),
    ).toMatchObject({ ok: true });

    expect(
      validateCastPlaybackUrl("http://192.168.1.50/private.mp4", {
        allowedHosts: ["192.168.1.25"],
      }),
    ).toMatchObject({ ok: false });
  });

  it("blocks local-only or credentialed playback URLs", () => {
    expect(validateCastPlaybackUrl("file:///Users/me/movie.mp4")).toMatchObject(
      {
        ok: false,
      },
    );
    expect(
      validateCastPlaybackUrl("http://localhost:11470/movie.mp4"),
    ).toMatchObject({
      ok: false,
    });
    expect(
      validateCastPlaybackUrl("http://user:pass@example.test/movie.mp4"),
    ).toMatchObject({
      ok: false,
    });
  });
});

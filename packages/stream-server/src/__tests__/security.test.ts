import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSignedGatewayStreamPath,
  requireBridgeAuth,
  validateCastPlaybackUrl,
  validateGatewayStreamSignature,
} from "../security.js";
import { redactSensitiveText } from "../redaction.js";
import { createStreamServerApp } from "../index.js";
import { pruneTorrents, validateTorrentFiles } from "../torrent.js";
import { getSafeCastContentType } from "../cast.js";

const previousBridgeToken = process.env.STREAMER_BRIDGE_TOKEN;
const previousGatewayStreamSecret = process.env.STREAMER_GATEWAY_STREAM_SECRET;
const previousGatewayStreamTtl = process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS;
const previousNodeEnv = process.env.NODE_ENV;

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

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("keeps bridge auth disabled by default for local development", async () => {
    delete process.env.STREAMER_BRIDGE_TOKEN;

    const res = await request(protectedApp()).get("/protected");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("fails closed in production when bridge auth is not configured", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.STREAMER_BRIDGE_TOKEN;

    const res = await request(protectedApp()).get("/protected");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "Bridge authentication is not configured",
      code: "BRIDGE_AUTH_NOT_CONFIGURED",
    });
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

  it("protects bridge control and metrics routes when bridge auth is configured", async () => {
    process.env.STREAMER_BRIDGE_TOKEN = "pairing-token";
    const app = createStreamServerApp();

    await request(app).post("/api/gateway/jobs").send({}).expect(401);
    await request(app).get("/api/gateway/jobs/missing").expect(401);
    await request(app).delete("/api/gateway/jobs/missing").expect(401);
    await request(app).get("/api/torrent/abcdef/metrics").expect(401);
    await request(app).get("/stats").expect(401);
  });
});

describe("Gateway stream URL signing", () => {
  afterEach(() => {
    if (previousGatewayStreamSecret === undefined) {
      delete process.env.STREAMER_GATEWAY_STREAM_SECRET;
    } else {
      process.env.STREAMER_GATEWAY_STREAM_SECRET = previousGatewayStreamSecret;
    }

    if (previousGatewayStreamTtl === undefined) {
      delete process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS;
    } else {
      process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS = previousGatewayStreamTtl;
    }
  });

  it("creates a signed gateway stream path that validates for the bound job", () => {
    process.env.STREAMER_GATEWAY_STREAM_SECRET = "test-gateway-secret";
    process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS = "60000";
    const path = createSignedGatewayStreamPath("job-1", 1_000);
    const query = Object.fromEntries(
      new URL(`http://bridge.test${path}`).searchParams,
    );

    expect(path).toMatch(
      /^\/api\/gateway\/jobs\/job-1\/stream\?expires=61000&signature=.+$/,
    );
    expect(
      validateGatewayStreamSignature("job-1", query, { now: 2_000 }),
    ).toMatchObject({ ok: true });
  });

  it("rejects missing, tampered, and expired gateway stream signatures", () => {
    process.env.STREAMER_GATEWAY_STREAM_SECRET = "test-gateway-secret";
    process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS = "60000";
    const path = createSignedGatewayStreamPath("job-1", 1_000);
    const query = Object.fromEntries(
      new URL(`http://bridge.test${path}`).searchParams,
    );

    expect(
      validateGatewayStreamSignature("job-1", {}, { now: 2_000 }),
    ).toMatchObject({ ok: false, reason: "missing" });
    expect(
      validateGatewayStreamSignature(
        "job-1",
        { ...query, signature: "tampered" },
        { now: 2_000 },
      ),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      validateGatewayStreamSignature("job-1", query, { now: 70_000 }),
    ).toMatchObject({ ok: false, reason: "expired" });
  });

  it("allows expired signatures only while the same job is actively streaming", () => {
    process.env.STREAMER_GATEWAY_STREAM_SECRET = "test-gateway-secret";
    process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS = "60000";
    const path = createSignedGatewayStreamPath("job-1", 1_000);
    const query = Object.fromEntries(
      new URL(`http://bridge.test${path}`).searchParams,
    );

    expect(
      validateGatewayStreamSignature("job-1", query, {
        now: 70_000,
        lastStreamAccessAt: 65_000,
        activeSignature: String(query.signature),
        activeGraceMs: 10_000,
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateGatewayStreamSignature("job-1", query, {
        now: 80_000,
        lastStreamAccessAt: 65_000,
        activeSignature: String(query.signature),
        activeGraceMs: 10_000,
      }),
    ).toMatchObject({ ok: false, reason: "expired" });
  });

  it("does not extend expired signatures that were not the active stream URL", () => {
    process.env.STREAMER_GATEWAY_STREAM_SECRET = "test-gateway-secret";
    process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS = "60000";
    const activePath = createSignedGatewayStreamPath("job-1", 1_000);
    const inactivePath = createSignedGatewayStreamPath("job-1", 2_000);
    const activeQuery = Object.fromEntries(
      new URL(`http://bridge.test${activePath}`).searchParams,
    );
    const inactiveQuery = Object.fromEntries(
      new URL(`http://bridge.test${inactivePath}`).searchParams,
    );

    expect(
      validateGatewayStreamSignature("job-1", inactiveQuery, {
        now: 80_000,
        lastStreamAccessAt: 75_000,
        activeSignature: String(activeQuery.signature),
        activeGraceMs: 10_000,
      }),
    ).toMatchObject({ ok: false, reason: "expired" });
  });
});

describe("stream-server log redaction", () => {
  it("redacts signed gateway URLs, magnets, and bearer tokens", () => {
    const output = redactSensitiveText(
      "Bearer bridge-token magnet:?xt=urn:btih:abcdef http://127.0.0.1:11470/api/gateway/jobs/job-1/stream?expires=123&signature=sig",
    );

    expect(output).toContain("Bearer [redacted]");
    expect(output).toContain("[magnet]");
    expect(output).toContain(
      "http://127.0.0.1:11470/api/gateway/jobs/[job]/stream?[signed]",
    );
    expect(output).not.toContain("bridge-token");
    expect(output).not.toContain("abcdef");
    expect(output).not.toContain("signature=sig");
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

  it("blocks loopback IP variants even when they appear in the allow-list", () => {
    expect(
      validateCastPlaybackUrl("http://127.0.0.1:11470/movie.mp4", {
        allowedHosts: ["127.0.0.1"],
      }),
    ).toMatchObject({
      ok: false,
      reason: "Localhost playback URLs cannot be cast",
    });

    expect(
      validateCastPlaybackUrl("http://[::1]:11470/movie.mp4", {
        allowedHosts: ["::1"],
      }),
    ).toMatchObject({
      ok: false,
      reason: "Localhost playback URLs cannot be cast",
    });

    expect(
      validateCastPlaybackUrl("http://[::ffff:7f00:1]:11470/movie.mp4", {
        allowedHosts: ["::ffff:7f00:1"],
      }),
    ).toMatchObject({
      ok: false,
      reason: "Localhost playback URLs cannot be cast",
    });
  });

  it("allows bridge-owned private IPv6 LAN playback URLs", () => {
    expect(
      validateCastPlaybackUrl("http://[fd00::25]:11470/api/gateway/job", {
        allowedHosts: ["fd00::25"],
      }),
    ).toMatchObject({ ok: true });
  });
});

describe("Cast content type validation", () => {
  it("allows supported HLS content types", () => {
    expect(getSafeCastContentType("application/vnd.apple.mpegurl")).toBe(
      "application/vnd.apple.mpegurl",
    );
  });

  it("falls back to MP4 for untrusted content types", () => {
    expect(getSafeCastContentType("text/html")).toBe("video/mp4");
  });
});

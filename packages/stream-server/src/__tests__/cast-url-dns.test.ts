import { describe, expect, it, vi } from "vitest";
import { validateCastPlaybackUrlWithDns } from "../security.js";

describe("cast URL DNS validation", () => {
  it("rejects hostnames that resolve to private or loopback addresses", async () => {
    const privateResult = await validateCastPlaybackUrlWithDns(
      "https://media.example.test/movie.mp4",
      {
        lookup: vi
          .fn()
          .mockResolvedValue([{ address: "192.168.1.50", family: 4 }]),
      },
    );
    const loopbackResult = await validateCastPlaybackUrlWithDns(
      "https://bridge.example.test/movie.mp4",
      {
        allowedHosts: ["bridge.example.test"],
        lookup: vi
          .fn()
          .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]),
      },
    );

    expect(privateResult).toMatchObject({ ok: false });
    expect(loopbackResult).toMatchObject({
      ok: false,
      reason: "Localhost playback URLs cannot be cast",
    });
  });

  it("allows public addresses and the exact bridge host on a private LAN", async () => {
    const publicResult = await validateCastPlaybackUrlWithDns(
      "https://media.example.test/movie.mp4",
      {
        lookup: vi
          .fn()
          .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      },
    );
    const bridgeResult = await validateCastPlaybackUrlWithDns(
      "http://bridge.lan:11470/api/bridge/v1/jobs/job/stream",
      {
        allowedHosts: ["bridge.lan"],
        lookup: vi
          .fn()
          .mockResolvedValue([{ address: "192.168.1.25", family: 4 }]),
      },
    );

    expect(publicResult).toMatchObject({ ok: true });
    expect(bridgeResult).toMatchObject({ ok: true });
  });

  it("fails closed when DNS resolution fails", async () => {
    const result = await validateCastPlaybackUrlWithDns(
      "https://media.example.test/movie.mp4",
      {
        lookup: vi.fn().mockRejectedValue(new Error("DNS unavailable")),
      },
    );

    expect(result).toEqual({
      ok: false,
      reason: "Playback URL hostname could not be resolved",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  classifyActionEndpoint,
  evaluateActionPreflight,
  validateActionBridgeUrl,
} from "../src/action-preflight";
import type { ActionPreflightInput } from "../src/types/action-preflight";

function input(
  overrides: Partial<ActionPreflightInput> = {},
): ActionPreflightInput {
  return {
    action: "play",
    platform: "web",
    source: { kind: "torrent" },
    bridge: {
      configured: true,
      status: "available",
      endpoint: {
        scope: "lan",
        deviceReachable: true,
        castReachable: true,
      },
      auth: {
        required: true,
        bridgeConfigured: true,
        clientConfigured: true,
      },
      capabilities: {
        gateway: true,
        torrent: true,
        remux: true,
        cast: true,
      },
    },
    ...overrides,
  };
}

describe("action preflight", () => {
  it("keeps direct playback ready when the torrent runtime is unavailable", () => {
    const result = evaluateActionPreflight(
      input({
        source: { kind: "direct", endpoint: "remote" },
        bridge: {
          configured: true,
          status: "unsupported",
          capabilities: { torrent: false, gateway: true },
        },
      }),
    );

    expect(result).toMatchObject({
      ready: true,
      reason: "ready",
      requiresBridge: false,
    });
  });

  it("uses the same unavailable reason for torrent play and download", () => {
    const bridge = {
      configured: true,
      status: "unreachable" as const,
      endpoint: { scope: "lan" as const, deviceReachable: true },
    };

    expect(evaluateActionPreflight(input({ bridge })).reason).toBe(
      "bridge_unreachable",
    );
    expect(
      evaluateActionPreflight(input({ action: "download", bridge })).reason,
    ).toBe("bridge_unreachable");
  });

  it("keeps bridge failure reasons consistent across every primary action", () => {
    const bridge = {
      configured: true,
      status: "unreachable" as const,
      endpoint: { scope: "lan" as const, deviceReachable: true },
    };
    const results = [
      evaluateActionPreflight(input({ action: "play", bridge })),
      evaluateActionPreflight(input({ action: "download", bridge })),
      evaluateActionPreflight(
        input({
          action: "cast",
          source: { kind: "direct", endpoint: "remote" },
          bridge,
        }),
      ),
    ];

    expect(results.map(({ reason }) => reason)).toEqual([
      "bridge_unreachable",
      "bridge_unreachable",
      "bridge_unreachable",
    ]);
    expect(results.every(({ ready }) => !ready)).toBe(true);
  });

  it("requires the bridge transport for direct casting", () => {
    const result = evaluateActionPreflight(
      input({
        action: "cast",
        source: { kind: "direct", endpoint: "remote" },
        bridge: { configured: true, status: "unreachable" },
      }),
    );

    expect(result).toMatchObject({
      ready: false,
      reason: "bridge_unreachable",
      requiresBridge: true,
    });
  });

  it("rejects loopback bridge URLs for native devices", () => {
    const result = evaluateActionPreflight(
      input({
        platform: "ios",
        bridge: {
          configured: true,
          status: "available",
          endpoint: { scope: "loopback", deviceReachable: false },
        },
      }),
    );

    expect(result.reason).toBe("bridge_loopback_unreachable");
  });

  it("does not treat an old no-peers job state as dead bridge liveness", () => {
    const result = evaluateActionPreflight(
      input({ bridge: { ...input().bridge!, status: "no-peers" } }),
    );

    expect(result.ready).toBe(true);
  });

  it("reports individual capability and auth failures", () => {
    expect(
      evaluateActionPreflight(
        input({
          bridge: {
            ...input().bridge!,
            auth: {
              required: true,
              bridgeConfigured: true,
              clientConfigured: false,
            },
          },
        }),
      ).reason,
    ).toBe("bridge_auth_required");

    expect(
      evaluateActionPreflight(
        input({
          bridge: {
            ...input().bridge!,
            capabilities: { gateway: true, torrent: false },
          },
        }),
      ).reason,
    ).toBe("torrent_engine_unavailable");

    expect(
      evaluateActionPreflight(
        input({
          source: { kind: "torrent", requiresRemux: true },
          bridge: {
            ...input().bridge!,
            capabilities: { gateway: true, torrent: true, remux: false },
          },
        }),
      ).reason,
    ).toBe("remux_unavailable");
  });

  it("classifies loopback, LAN, remote, and invalid endpoints", () => {
    expect(classifyActionEndpoint("http://127.0.0.1:11470")).toBe("loopback");
    expect(classifyActionEndpoint("http://192.168.1.20:11470")).toBe("lan");
    expect(classifyActionEndpoint("https://media.example.test/video.mp4")).toBe(
      "remote",
    );
    expect(classifyActionEndpoint("file:///tmp/video.mp4")).toBe("invalid");
  });

  it("validates bridge URLs with one local-network policy", () => {
    expect(validateActionBridgeUrl("http://localhost:11470")).toMatchObject({
      ok: true,
      scope: "loopback",
    });
    expect(validateActionBridgeUrl("http://10.0.2.2:11470")).toMatchObject({
      ok: true,
      scope: "lan",
    });
    expect(
      validateActionBridgeUrl("https://bridge.example.test"),
    ).toMatchObject({
      ok: false,
      reason: "not-local-or-lan",
      scope: "remote",
    });
    expect(
      validateActionBridgeUrl("http://user:pass@192.168.1.25:11470"),
    ).toMatchObject({
      ok: false,
      reason: "credentials-not-allowed",
    });
  });

  it("reports an invalid configured URL before setup guidance", () => {
    const result = evaluateActionPreflight(
      input({
        bridge: {
          configured: false,
          status: "wrong-url",
          endpoint: { scope: "remote" },
        },
      }),
    );

    expect(result.reason).toBe("bridge_url_invalid");
  });
});

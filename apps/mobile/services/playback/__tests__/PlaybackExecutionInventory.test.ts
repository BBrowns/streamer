import type { BridgeHealthHint, DeviceProfile } from "@streamer/shared";
import { buildPlaybackExecutionNodes } from "../PlaybackExecutionInventory";

const deviceProfile: DeviceProfile = {
  platform: "ios",
  maxQuality: "1080p",
  network: "local",
  supports: {
    h264: true,
    h265: true,
    av1: false,
    mp4: true,
    mkv: false,
    hls: true,
    dolbyVision: false,
    aac: true,
    ac3: false,
    eac3: false,
  },
};

function bridge(overrides: Partial<BridgeHealthHint> = {}): BridgeHealthHint {
  return {
    status: "available",
    configured: true,
    endpoint: {
      scope: "lan",
      deviceReachable: true,
      castReachable: true,
    },
    ...overrides,
  };
}

describe("buildPlaybackExecutionNodes", () => {
  it("advertises only executable direct and HLS delivery on-device", () => {
    const nodes = buildPlaybackExecutionNodes({ deviceProfile });

    expect(nodes).toEqual([
      expect.objectContaining({
        executionTarget: "on-device",
        availability: "available",
        acceptedSourceKinds: ["direct", "hls"],
        deliveries: expect.arrayContaining([
          expect.objectContaining({
            delivery: "direct",
            capabilities: expect.objectContaining({ offline: true }),
          }),
          expect.objectContaining({ delivery: "hls" }),
        ]),
      }),
    ]);
    expect(nodes[0].deliveries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ delivery: "offline-file" }),
      ]),
    );
  });

  it("maps a negotiated LAN bridge to a paired bridge with v1 deliveries", () => {
    const nodes = buildPlaybackExecutionNodes({
      deviceProfile,
      bridge: bridge(),
      bridgeProtocolVersion: 1,
      bridgeDeliveries: ["range-http", "progressive-fmp4", "seekable-cache"],
      bridgeCastAvailable: true,
    });

    expect(nodes[1]).toMatchObject({
      executionTarget: "paired-bridge",
      availability: "available",
      acceptedSourceKinds: ["torrent"],
      bridgeProtocolVersion: 1,
    });
    expect(nodes[1]?.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ delivery: "range-http" }),
        expect.objectContaining({ delivery: "progressive-fmp4" }),
        expect.objectContaining({ delivery: "seekable-cache" }),
      ]),
    );
  });

  it("maps loopback ownership to a local sidecar", () => {
    const nodes = buildPlaybackExecutionNodes({
      deviceProfile: { ...deviceProfile, platform: "electron" },
      bridge: bridge({
        endpoint: {
          scope: "loopback",
          deviceReachable: true,
          castReachable: false,
        },
      }),
      bridgeProtocolVersion: 1,
      bridgeDeliveries: ["range-http"],
    });

    expect(nodes[1]?.executionTarget).toBe("local-sidecar");
  });

  it("does not advertise a bridge route before successful v1 negotiation", () => {
    const nodes = buildPlaybackExecutionNodes({
      deviceProfile,
      bridge: bridge(),
    });

    expect(nodes).toHaveLength(1);
  });

  it("fails closed for an unreachable or non-device-reachable bridge", () => {
    const nodes = buildPlaybackExecutionNodes({
      deviceProfile,
      bridge: bridge({
        status: "unreachable",
        endpoint: {
          scope: "lan",
          deviceReachable: false,
          castReachable: false,
        },
      }),
      bridgeProtocolVersion: 1,
      bridgeDeliveries: ["range-http"],
    });

    expect(nodes).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  createSyncWebSocketProtocols,
  parseSyncWebSocketProtocols,
  SYNC_WEBSOCKET_PROTOCOL,
} from "../sync-websocket";

const ACCESS_TOKEN = "header.payload.signature";

describe("sync WebSocket protocols", () => {
  it("round-trips bounded browser credentials behind the public protocol", () => {
    const protocols = createSyncWebSocketProtocols(
      ACCESS_TOKEN,
      "desktop-browser-1",
    );

    expect(protocols[0]).toBe(SYNC_WEBSOCKET_PROTOCOL);
    expect(parseSyncWebSocketProtocols(protocols.join(", "))).toEqual({
      accessToken: ACCESS_TOKEN,
      deviceId: "desktop-browser-1",
    });
  });

  it("rejects credentials when the public protocol is not negotiated first", () => {
    expect(
      parseSyncWebSocketProtocols(
        `streamer-auth.${ACCESS_TOKEN}, ${SYNC_WEBSOCKET_PROTOCOL}`,
      ),
    ).toBeNull();
  });

  it("rejects duplicate or malformed credential carriers", () => {
    expect(
      parseSyncWebSocketProtocols(
        `${SYNC_WEBSOCKET_PROTOCOL}, streamer-auth.${ACCESS_TOKEN}, streamer-auth.${ACCESS_TOKEN}`,
      ),
    ).toBeNull();
    expect(
      parseSyncWebSocketProtocols(
        `${SYNC_WEBSOCKET_PROTOCOL}, streamer-auth.not/a/token`,
      ),
    ).toBeNull();
    expect(
      parseSyncWebSocketProtocols(
        `${SYNC_WEBSOCKET_PROTOCOL}, streamer-auth.${ACCESS_TOKEN}, streamer-device.invalid device`,
      ),
    ).toBeNull();
  });

  it("omits a malformed optional device id without blocking authentication", () => {
    expect(
      createSyncWebSocketProtocols(ACCESS_TOKEN, "invalid device"),
    ).toEqual([SYNC_WEBSOCKET_PROTOCOL, `streamer-auth.${ACCESS_TOKEN}`]);
  });

  it("leaves token validity to server auth instead of crashing the renderer", () => {
    const protocols = createSyncWebSocketProtocols("expired-access-token");

    expect(parseSyncWebSocketProtocols(protocols.join(", "))).toEqual({
      accessToken: "expired-access-token",
    });
  });
});

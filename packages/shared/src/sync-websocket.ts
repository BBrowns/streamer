import { z } from "zod";
import { SECURITY_LIMITS } from "./limits";

export const SYNC_WEBSOCKET_PROTOCOL = "streamer-sync-v1";
export const SYNC_WEBSOCKET_MAX_PAYLOAD_BYTES =
  SECURITY_LIMITS.syncWebSocketPayloadBytes;

const AUTH_PROTOCOL_PREFIX = "streamer-auth.";
const DEVICE_PROTOCOL_PREFIX = "streamer-device.";
const MAX_ACCESS_TOKEN_LENGTH = 4_096;
const MAX_DEVICE_ID_LENGTH = 128;
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._~-]+$/;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export type SyncWebSocketCredentials = {
  accessToken: string;
  deviceId?: string;
};

function isBoundedAccessToken(value: string) {
  return (
    value.length > 0 &&
    value.length <= MAX_ACCESS_TOKEN_LENGTH &&
    ACCESS_TOKEN_PATTERN.test(value)
  );
}

function isBoundedDeviceId(value: string) {
  return (
    value.length > 0 &&
    value.length <= MAX_DEVICE_ID_LENGTH &&
    DEVICE_ID_PATTERN.test(value)
  );
}

/** Keep device-derived Redis keys and session records bounded and delimiter-safe. */
export function normalizeDeviceId(
  value: unknown,
  fallback = "unknown-browser",
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return isBoundedDeviceId(normalized) ? normalized : fallback;
}

export function createSyncWebSocketProtocols(
  accessToken: string,
  deviceId?: string | null,
): string[] {
  const normalizedToken = accessToken.trim();
  if (!isBoundedAccessToken(normalizedToken)) {
    throw new Error("Cannot create sync WebSocket protocols from this token");
  }

  const protocols = [
    SYNC_WEBSOCKET_PROTOCOL,
    `${AUTH_PROTOCOL_PREFIX}${normalizedToken}`,
  ];
  const normalizedDeviceId = deviceId?.trim();
  if (normalizedDeviceId && isBoundedDeviceId(normalizedDeviceId)) {
    protocols.push(`${DEVICE_PROTOCOL_PREFIX}${normalizedDeviceId}`);
  }

  return protocols;
}

export function parseSyncWebSocketProtocols(
  header: string | undefined,
): SyncWebSocketCredentials | null {
  if (!header) return null;

  const protocols = header
    .split(",")
    .map((protocol) => protocol.trim())
    .filter(Boolean);

  if (
    protocols.length < 2 ||
    protocols.length > 3 ||
    protocols.filter((protocol) => protocol === SYNC_WEBSOCKET_PROTOCOL)
      .length !== 1 ||
    protocols.some(
      (protocol) =>
        protocol !== SYNC_WEBSOCKET_PROTOCOL &&
        !protocol.startsWith(AUTH_PROTOCOL_PREFIX) &&
        !protocol.startsWith(DEVICE_PROTOCOL_PREFIX),
    )
  ) {
    return null;
  }

  // The Node WebSocket adapter negotiates the first offered protocol. Keep
  // the stable public protocol first so credentials are never echoed back as
  // the selected subprotocol.
  if (protocols[0] !== SYNC_WEBSOCKET_PROTOCOL) return null;

  const authProtocols = protocols.filter((protocol) =>
    protocol.startsWith(AUTH_PROTOCOL_PREFIX),
  );
  if (authProtocols.length !== 1) return null;

  const accessToken = authProtocols[0].slice(AUTH_PROTOCOL_PREFIX.length);
  if (!isBoundedAccessToken(accessToken)) return null;

  const deviceProtocols = protocols.filter((protocol) =>
    protocol.startsWith(DEVICE_PROTOCOL_PREFIX),
  );
  if (deviceProtocols.length > 1) return null;

  const deviceId = deviceProtocols[0]?.slice(DEVICE_PROTOCOL_PREFIX.length);
  if (deviceId !== undefined && !isBoundedDeviceId(deviceId)) return null;

  return {
    accessToken,
    ...(deviceId ? { deviceId } : {}),
  };
}

export const syncWebSocketMessageSchema = z
  .object({
    event: z.literal("playback_update"),
    data: z
      .record(z.string().max(128), z.unknown())
      .superRefine((value, context) => {
        if (Object.keys(value).length > 64) {
          context.addIssue({
            code: "custom",
            message: "Too many fields in sync message",
          });
        }
      }),
  })
  .strict();

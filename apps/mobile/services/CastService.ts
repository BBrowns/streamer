import * as Crypto from "expo-crypto";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";
import { getBridgeAuthHeaders, withBridgeJsonHeaders } from "./bridgeAuth";
import type { CastDeviceCapabilities } from "./playback/deviceProfile";
import {
  preflightBridgeAction,
  preflightStreamAction,
  requireActionPreflight,
} from "./actionPreflight";
import { detectPlaybackBridgeOnce } from "./playback/PlaybackPlanService";
import { redactSensitiveText } from "./redaction";
import {
  BridgeClientError,
  getBridgeClient,
  type BridgeProtocolSelection,
} from "./bridge/BridgeClient";

export interface CastDevice {
  id: string;
  name: string;
  type: string;
  capabilities?: CastDeviceCapabilities;
}

export type CastControlAction = "play" | "pause" | "stop" | "seek";
export interface CastPlaybackStatus {
  currentTime: number;
  duration: number;
  isPaused: boolean;
  playerState: string;
}
export type CastContentType =
  "video/mp4" | "application/vnd.apple.mpegurl" | "application/x-mpegURL";

export type CastServiceErrorCode =
  | "CAST_DEVICES_UNREACHABLE"
  | "CAST_DEVICE_UNREACHABLE"
  | "CAST_SOURCE_REJECTED"
  | "CAST_BRIDGE_REJECTED"
  | "CAST_FAILED";

export const CAST_DEVICE_CACHE_TTL_MS = 15_000;

interface CastDeviceCache {
  bridgeUrl: string;
  expiresAt: number;
  protocol: BridgeProtocolSelection["kind"];
  devices: CastDevice[];
}

export class CastServiceError extends Error {
  constructor(
    readonly code: CastServiceErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(redactSensitiveText(message));
    this.name = "CastServiceError";
  }
}

function shouldInvalidateDeviceCache(error: unknown) {
  if (error instanceof CastServiceError) {
    return (
      error.code === "CAST_DEVICE_UNREACHABLE" ||
      error.code === "CAST_DEVICES_UNREACHABLE"
    );
  }
  if (error instanceof BridgeClientError) {
    return [
      "CAST_DEVICE_NOT_FOUND",
      "CAST_SESSION_NOT_FOUND",
      "BRIDGE_UNREACHABLE",
    ].includes(error.code);
  }
  return true;
}

async function getCastResponseError(response: Response, fallback: string) {
  const body = await response.text().catch(() => "");
  if (!body) return fallback;
  try {
    const parsed = JSON.parse(body) as { error?: string };
    return parsed.error || fallback;
  } catch {
    return body;
  }
}

function toV1CastServiceError(
  error: unknown,
  unavailableCode: "CAST_DEVICES_UNREACHABLE" | "CAST_DEVICE_UNREACHABLE",
  fallback: string,
) {
  if (!(error instanceof BridgeClientError)) {
    return new CastServiceError(unavailableCode, fallback);
  }

  const code: CastServiceErrorCode =
    error.code === "CAST_DEVICE_NOT_FOUND" ||
    error.code === "CAST_SESSION_NOT_FOUND" ||
    error.code === "BRIDGE_UNREACHABLE"
      ? unavailableCode
      : error.code === "CAST_SOURCE_REJECTED"
        ? "CAST_SOURCE_REJECTED"
        : error.code === "AUTH_REQUIRED" ||
            error.code === "AUTH_NOT_CONFIGURED" ||
            error.code === "FORBIDDEN"
          ? "CAST_BRIDGE_REJECTED"
          : "CAST_FAILED";
  return new CastServiceError(code, error.message || fallback, error.status);
}

function getV1CastSource(
  bridgeUrl: string,
  url: string,
  contentType: CastContentType,
  bridgeJobId?: string,
) {
  if (bridgeJobId) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        bridgeJobId,
      )
    ) {
      throw new CastServiceError(
        "CAST_SOURCE_REJECTED",
        "The prepared bridge source has an invalid identity.",
      );
    }
    return { kind: "bridge-job" as const, jobId: bridgeJobId };
  }

  try {
    const bridge = new URL(bridgeUrl);
    const source = new URL(url);
    const jobId = source.pathname.match(
      /^\/api\/(?:gateway|bridge\/v1)\/jobs\/([0-9a-f-]+)\/stream$/i,
    )?.[1];
    if (source.origin === bridge.origin && jobId) {
      return { kind: "bridge-job" as const, jobId };
    }
  } catch {
    // The action preflight owns the user-facing URL validation error.
  }

  return {
    kind: "external-url" as const,
    url,
    contentType,
  };
}

class CastService {
  private readonly deviceProtocols = new Map<
    string,
    BridgeProtocolSelection["kind"]
  >();
  private deviceCache: CastDeviceCache | null = null;

  getBridgeUrl(): string {
    return streamEngineManager.getBridgeUrl();
  }

  async getDevices(
    options: { forceRefresh?: boolean } = {},
  ): Promise<CastDevice[]> {
    if (!streamEngineManager.bridgeAvailable) {
      // The web cast dialog can open before the app's opportunistic startup
      // probe has completed. Join the same single-flight probe used by Play
      // rather than rejecting a bridge that is still becoming available.
      await detectPlaybackBridgeOnce();
    }
    requireActionPreflight(
      preflightBridgeAction("cast", { sourceKind: "direct" }),
    );

    const bridgeUrl = this.getBridgeUrl();
    const cached = this.deviceCache;
    if (
      !options.forceRefresh &&
      cached &&
      cached.bridgeUrl === bridgeUrl &&
      cached.expiresAt > Date.now()
    ) {
      this.rememberDeviceProtocols(cached.devices, cached.protocol);
      return cloneDevices(cached.devices);
    }

    const client = getBridgeClient(bridgeUrl);
    let protocol: BridgeProtocolSelection;
    try {
      protocol = await client.negotiate();
    } catch (error) {
      if (shouldInvalidateDeviceCache(error)) this.invalidateDeviceCache();
      throw toV1CastServiceError(
        error,
        "CAST_DEVICES_UNREACHABLE",
        "Could not search for displays on the configured bridge.",
      );
    }
    if (protocol.kind === "v1") {
      try {
        const devices = (await client.getCastDevices()).devices;
        this.rememberDeviceProtocols(devices, "v1");
        this.cacheDevices(bridgeUrl, "v1", devices);
        return cloneDevices(devices);
      } catch (error) {
        this.invalidateDeviceCache();
        throw toV1CastServiceError(
          error,
          "CAST_DEVICES_UNREACHABLE",
          "Could not search for displays on the configured bridge.",
        );
      }
    }

    const authHeaders = getBridgeAuthHeaders();
    let res: Response;
    try {
      res =
        Object.keys(authHeaders).length > 0
          ? await fetch(`${bridgeUrl}/api/cast/devices`, {
              headers: authHeaders,
            })
          : await fetch(`${bridgeUrl}/api/cast/devices`);
    } catch {
      this.invalidateDeviceCache();
      throw new CastServiceError(
        "CAST_DEVICES_UNREACHABLE",
        "Could not search for displays on the configured bridge.",
      );
    }
    if (!res.ok) {
      if (res.status === 404 || res.status >= 500) {
        this.invalidateDeviceCache();
      }
      throw new CastServiceError(
        "CAST_BRIDGE_REJECTED",
        await getCastResponseError(
          res,
          `Could not search for displays (${res.status}).`,
        ),
        res.status,
      );
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (error) {
      if (shouldInvalidateDeviceCache(error)) this.invalidateDeviceCache();
      throw new CastServiceError(
        "CAST_DEVICES_UNREACHABLE",
        "Could not search for displays on the configured bridge.",
      );
    }
    const devices: CastDevice[] = Array.isArray(data)
      ? (data as CastDevice[])
      : data &&
          typeof data === "object" &&
          "devices" in data &&
          Array.isArray(data.devices)
        ? (data.devices as CastDevice[])
        : [];
    this.rememberDeviceProtocols(devices, "legacy");
    this.cacheDevices(bridgeUrl, "legacy", devices);
    return cloneDevices(devices);
  }

  async play(
    deviceId: string,
    url: string,
    title: string,
    contentType: CastContentType = "video/mp4",
    options: { bridgeJobId?: string } = {},
  ): Promise<void> {
    requireActionPreflight(
      preflightStreamAction("cast", {
        url,
        title,
      }),
    );

    const bridgeUrl = this.getBridgeUrl();
    const client = getBridgeClient(bridgeUrl);
    let protocol: BridgeProtocolSelection;
    try {
      protocol = await this.protocolForDevice(deviceId, client);
      if (protocol.kind === "v1") {
        await client.playCast({
          requestId: Crypto.randomUUID(),
          deviceId,
          source: getV1CastSource(
            bridgeUrl,
            url,
            contentType,
            options.bridgeJobId,
          ),
          title,
        });
        this.deviceProtocols.set(deviceId, "v1");
        return;
      }
    } catch (error) {
      if (shouldInvalidateDeviceCache(error)) this.invalidateDeviceCache();
      throw toV1CastServiceError(
        error,
        "CAST_DEVICE_UNREACHABLE",
        "The selected display could not be reached.",
      );
    }

    let res: Response;
    try {
      res = await fetch(`${bridgeUrl}/api/cast/play`, {
        method: "POST",
        headers: withBridgeJsonHeaders(),
        body: JSON.stringify({ deviceId, url, title, contentType }),
      });
    } catch {
      this.invalidateDeviceCache();
      throw new CastServiceError(
        "CAST_DEVICE_UNREACHABLE",
        "The selected display could not be reached.",
      );
    }

    if (!res.ok) {
      if (res.status === 404 || res.status >= 500) {
        this.invalidateDeviceCache();
      }
      const code: CastServiceErrorCode =
        res.status === 404
          ? "CAST_DEVICE_UNREACHABLE"
          : res.status === 400
            ? "CAST_SOURCE_REJECTED"
            : res.status === 401 || res.status === 403
              ? "CAST_BRIDGE_REJECTED"
              : "CAST_FAILED";
      throw new CastServiceError(
        code,
        await getCastResponseError(res, "Casting did not start."),
        res.status,
      );
    }
    this.deviceProtocols.set(deviceId, "legacy");
  }

  async control(
    deviceId: string,
    action: CastControlAction,
    position?: number,
  ): Promise<void> {
    requireActionPreflight(
      preflightBridgeAction("cast", { sourceKind: "direct" }),
    );
    const bridgeUrl = this.getBridgeUrl();
    const client = getBridgeClient(bridgeUrl);
    try {
      const protocol = await this.protocolForDevice(deviceId, client);
      if (protocol.kind === "v1") {
        await client.controlCast({
          deviceId,
          action,
          ...(action === "seek" && position !== undefined
            ? { positionSeconds: position }
            : {}),
        });
        return;
      }
    } catch (error) {
      if (shouldInvalidateDeviceCache(error)) this.invalidateDeviceCache();
      throw toV1CastServiceError(
        error,
        "CAST_DEVICE_UNREACHABLE",
        "The selected display could not be reached.",
      );
    }
    let res: Response;
    try {
      res = await fetch(`${bridgeUrl}/api/cast/control`, {
        method: "POST",
        headers: withBridgeJsonHeaders(),
        body: JSON.stringify({ deviceId, action, position }),
      });
    } catch {
      this.invalidateDeviceCache();
      throw new CastServiceError(
        "CAST_DEVICE_UNREACHABLE",
        "The selected display could not be reached.",
      );
    }

    if (!res.ok) {
      if (res.status === 404 || res.status >= 500) {
        this.invalidateDeviceCache();
      }
      throw new CastServiceError(
        res.status === 404 ? "CAST_DEVICE_UNREACHABLE" : "CAST_FAILED",
        await getCastResponseError(res, "Cast control failed."),
        res.status,
      );
    }
  }

  async getStatus(deviceId: string): Promise<CastPlaybackStatus> {
    requireActionPreflight(
      preflightBridgeAction("cast", { sourceKind: "direct" }),
    );
    const bridgeUrl = this.getBridgeUrl();
    const client = getBridgeClient(bridgeUrl);
    try {
      const protocol = await this.protocolForDevice(deviceId, client);
      if (protocol.kind === "v1") {
        const status = await client.getCastStatus(deviceId);
        return {
          currentTime: status.currentTime,
          duration: status.duration,
          isPaused: status.isPaused,
          playerState: status.playerState,
        };
      }
    } catch (error) {
      if (shouldInvalidateDeviceCache(error)) this.invalidateDeviceCache();
      throw toV1CastServiceError(
        error,
        "CAST_DEVICE_UNREACHABLE",
        "The selected display status could not be reached.",
      );
    }
    let res: Response;
    try {
      res = await fetch(
        `${bridgeUrl}/api/cast/status/${encodeURIComponent(deviceId)}`,
        { headers: getBridgeAuthHeaders() },
      );
    } catch {
      this.invalidateDeviceCache();
      throw new CastServiceError(
        "CAST_DEVICE_UNREACHABLE",
        "The selected display status could not be reached.",
      );
    }
    if (!res.ok) {
      if (res.status === 404 || res.status >= 500) {
        this.invalidateDeviceCache();
      }
      throw new CastServiceError(
        res.status === 404 ? "CAST_DEVICE_UNREACHABLE" : "CAST_FAILED",
        await getCastResponseError(res, "Cast status could not be loaded."),
        res.status,
      );
    }
    return res.json();
  }

  private async protocolForDevice(
    deviceId: string,
    client: ReturnType<typeof getBridgeClient>,
  ): Promise<BridgeProtocolSelection> {
    const boundProtocol = this.deviceProtocols.get(deviceId);
    if (boundProtocol === "v1") {
      const selection = await client.negotiate();
      if (selection.kind !== "v1") {
        throw new BridgeClientError(
          "PROTOCOL_UNSUPPORTED",
          "The selected display requires bridge protocol v1.",
        );
      }
      return selection;
    }
    if (boundProtocol === "legacy") return { kind: "legacy" };
    return client.negotiate();
  }

  private rememberDeviceProtocols(
    devices: CastDevice[],
    protocol: BridgeProtocolSelection["kind"],
  ) {
    this.deviceProtocols.clear();
    for (const device of devices) {
      this.deviceProtocols.set(device.id, protocol);
    }
  }

  private cacheDevices(
    bridgeUrl: string,
    protocol: BridgeProtocolSelection["kind"],
    devices: CastDevice[],
  ) {
    this.deviceCache = {
      bridgeUrl,
      expiresAt: Date.now() + CAST_DEVICE_CACHE_TTL_MS,
      protocol,
      devices: cloneDevices(devices),
    };
  }

  private invalidateDeviceCache() {
    this.deviceCache = null;
  }

  __resetForTests() {
    this.deviceProtocols.clear();
    this.invalidateDeviceCache();
  }
}

function cloneDevices(devices: CastDevice[]): CastDevice[] {
  return devices.map((device) => ({
    ...device,
    ...(device.capabilities
      ? { capabilities: { ...device.capabilities } }
      : {}),
  }));
}

export const castService = new CastService();

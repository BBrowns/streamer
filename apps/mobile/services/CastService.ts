import { Platform } from "react-native";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";
import { getBridgeAuthHeaders, withBridgeJsonHeaders } from "./bridgeAuth";
import type { CastDeviceCapabilities } from "./playback/deviceProfile";
import {
  preflightBridgeAction,
  preflightStreamAction,
  requireActionPreflight,
} from "./actionPreflight";
import { redactSensitiveText } from "./redaction";

export interface CastDevice {
  id: string;
  name: string;
  type: string;
  capabilities?: CastDeviceCapabilities;
}

export type CastControlAction = "play" | "pause" | "stop";
export type CastContentType =
  | "video/mp4"
  | "application/vnd.apple.mpegurl"
  | "application/x-mpegURL";

export type CastServiceErrorCode =
  | "CAST_DEVICES_UNREACHABLE"
  | "CAST_DEVICE_UNREACHABLE"
  | "CAST_SOURCE_REJECTED"
  | "CAST_BRIDGE_REJECTED"
  | "CAST_FAILED";

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

class CastService {
  getBridgeUrl(): string {
    return streamEngineManager.getBridgeUrl();
  }

  async getDevices(): Promise<CastDevice[]> {
    if (Platform.OS !== "web" && !streamEngineManager.bridgeAvailable) {
      await streamEngineManager.detectBridge();
    }
    requireActionPreflight(
      preflightBridgeAction("cast", { sourceKind: "direct" }),
    );

    const authHeaders = getBridgeAuthHeaders();
    let res: Response;
    try {
      res =
        Object.keys(authHeaders).length > 0
          ? await fetch(`${this.getBridgeUrl()}/api/cast/devices`, {
              headers: authHeaders,
            })
          : await fetch(`${this.getBridgeUrl()}/api/cast/devices`);
    } catch {
      throw new CastServiceError(
        "CAST_DEVICES_UNREACHABLE",
        "Could not search for displays on the configured bridge.",
      );
    }
    if (!res.ok) {
      throw new CastServiceError(
        "CAST_BRIDGE_REJECTED",
        await getCastResponseError(
          res,
          `Could not search for displays (${res.status}).`,
        ),
        res.status,
      );
    }

    const data = await res.json();
    return Array.isArray(data) ? data : data.devices || [];
  }

  async play(
    deviceId: string,
    url: string,
    title: string,
    contentType: CastContentType = "video/mp4",
  ): Promise<void> {
    requireActionPreflight(
      preflightStreamAction("cast", {
        url,
        title,
      }),
    );

    let res: Response;
    try {
      res = await fetch(`${this.getBridgeUrl()}/api/cast/play`, {
        method: "POST",
        headers: withBridgeJsonHeaders(),
        body: JSON.stringify({ deviceId, url, title, contentType }),
      });
    } catch {
      throw new CastServiceError(
        "CAST_DEVICE_UNREACHABLE",
        "The selected display could not be reached.",
      );
    }

    if (!res.ok) {
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
  }

  async control(deviceId: string, action: CastControlAction): Promise<void> {
    requireActionPreflight(
      preflightBridgeAction("cast", { sourceKind: "direct" }),
    );
    let res: Response;
    try {
      res = await fetch(`${this.getBridgeUrl()}/api/cast/control`, {
        method: "POST",
        headers: withBridgeJsonHeaders(),
        body: JSON.stringify({ deviceId, action }),
      });
    } catch {
      throw new CastServiceError(
        "CAST_DEVICE_UNREACHABLE",
        "The selected display could not be reached.",
      );
    }

    if (!res.ok) {
      throw new CastServiceError(
        res.status === 404 ? "CAST_DEVICE_UNREACHABLE" : "CAST_FAILED",
        await getCastResponseError(res, "Cast control failed."),
        res.status,
      );
    }
  }
}

export const castService = new CastService();

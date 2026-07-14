import { Platform } from "react-native";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";
import { getBridgeAuthHeaders, withBridgeJsonHeaders } from "./bridgeAuth";
import type { CastDeviceCapabilities } from "./playback/deviceProfile";
import {
  preflightBridgeAction,
  preflightStreamAction,
  requireActionPreflight,
} from "./actionPreflight";

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
    const res =
      Object.keys(authHeaders).length > 0
        ? await fetch(`${this.getBridgeUrl()}/api/cast/devices`, {
            headers: authHeaders,
          })
        : await fetch(`${this.getBridgeUrl()}/api/cast/devices`);
    if (!res.ok) {
      throw new Error(`Could not fetch cast devices (${res.status})`);
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

    const res = await fetch(`${this.getBridgeUrl()}/api/cast/play`, {
      method: "POST",
      headers: withBridgeJsonHeaders(),
      body: JSON.stringify({ deviceId, url, title, contentType }),
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }
  }

  async control(deviceId: string, action: CastControlAction): Promise<void> {
    requireActionPreflight(
      preflightBridgeAction("cast", { sourceKind: "direct" }),
    );
    const res = await fetch(`${this.getBridgeUrl()}/api/cast/control`, {
      method: "POST",
      headers: withBridgeJsonHeaders(),
      body: JSON.stringify({ deviceId, action }),
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }
  }
}

export const castService = new CastService();

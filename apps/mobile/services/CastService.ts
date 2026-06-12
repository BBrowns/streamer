import { Platform } from "react-native";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";
import { getBridgeAuthHeaders, withBridgeJsonHeaders } from "./bridgeAuth";
import type { CastDeviceCapabilities } from "./playback/deviceProfile";

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

function isLocalhostPlaybackUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
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
    if (isLocalhostPlaybackUrl(url)) {
      throw new Error("Cast devices cannot access localhost playback URLs.");
    }

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

import { Platform } from "react-native";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";

export interface CastDevice {
  id: string;
  name: string;
  type: string;
}

export type CastControlAction = "play" | "pause" | "stop";

class CastService {
  getBridgeUrl(): string {
    return streamEngineManager.getBridgeUrl();
  }

  async getDevices(): Promise<CastDevice[]> {
    if (Platform.OS !== "web" && !streamEngineManager.bridgeAvailable) {
      await streamEngineManager.detectBridge();
    }

    const res = await fetch(`${this.getBridgeUrl()}/api/cast/devices`);
    if (!res.ok) {
      throw new Error(`Could not fetch cast devices (${res.status})`);
    }

    const data = await res.json();
    return Array.isArray(data) ? data : data.devices || [];
  }

  async play(deviceId: string, url: string, title: string): Promise<void> {
    const res = await fetch(`${this.getBridgeUrl()}/api/cast/play`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, url, title }),
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }
  }

  async control(deviceId: string, action: CastControlAction): Promise<void> {
    const res = await fetch(`${this.getBridgeUrl()}/api/cast/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, action }),
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }
  }
}

export const castService = new CastService();

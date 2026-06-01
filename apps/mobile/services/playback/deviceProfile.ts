import { Platform } from "react-native";
import type { DeviceProfile } from "@streamer/shared";

function canPlayType(mimeType: string): boolean {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;
  const video = document.createElement("video");
  const support = video.canPlayType(mimeType);
  return support === "probably" || support === "maybe";
}

export function getDeviceProfile(): DeviceProfile {
  if (Platform.OS === "web") {
    const isElectron =
      typeof window !== "undefined" && Boolean((window as any).desktopBridge);
    return {
      platform: isElectron ? "electron" : "web",
      maxQuality: "1080p",
      network: "local",
      supports: {
        h264: canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
        h265:
          canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') ||
          canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"'),
        av1: canPlayType('video/mp4; codecs="av01.0.05M.08"'),
        mp4: canPlayType("video/mp4"),
        mkv: canPlayType("video/x-matroska"),
        hls:
          canPlayType("application/vnd.apple.mpegurl") ||
          canPlayType("application/x-mpegURL"),
        dolbyVision: false,
        aac: true,
        ac3: false,
        eac3: false,
      },
    };
  }

  if (Platform.OS === "ios") {
    return {
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
  }

  if (Platform.OS === "android") {
    return {
      platform: "android",
      maxQuality: "1080p",
      network: "local",
      supports: {
        h264: true,
        h265: false,
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
  }

  return {
    platform: "unknown",
    maxQuality: "1080p",
    network: "unknown",
    supports: {
      h264: true,
      h265: false,
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
}

export function getChromecastDeviceProfile(): DeviceProfile {
  return {
    platform: "chromecast",
    maxQuality: "1080p",
    network: "local",
    supports: {
      h264: true,
      h265: false,
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
}

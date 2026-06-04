import { Platform } from "react-native";
import type {
  DeviceProfile,
  PlaybackSessionCastProfile,
} from "@streamer/shared";

export interface CastDeviceCapabilities {
  maxQuality?: DeviceProfile["maxQuality"];
  supportsHls?: boolean;
  supportsMp4?: boolean;
  supportsMkv?: boolean;
  supportedCodecs?: string[];
  canAccessLocalhost?: boolean;
  requiresRemoteReachableUrl?: boolean;
  remuxAllowed?: boolean;
}

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

function supportsCodec(
  capabilities: CastDeviceCapabilities | undefined,
  ...aliases: string[]
) {
  if (!capabilities?.supportedCodecs) return undefined;
  const codecs = new Set(
    capabilities.supportedCodecs.map((codec) => codec.toLowerCase()),
  );
  return aliases.some((alias) => codecs.has(alias));
}

export function getChromecastDeviceProfile(
  capabilities?: CastDeviceCapabilities,
): DeviceProfile {
  return {
    platform: "chromecast",
    maxQuality: capabilities?.maxQuality ?? "1080p",
    network: "local",
    supports: {
      h264: supportsCodec(capabilities, "h264", "avc", "avc1") ?? true,
      h265:
        supportsCodec(capabilities, "h265", "hevc", "hev1", "hvc1") ?? false,
      av1: supportsCodec(capabilities, "av1", "av01") ?? false,
      mp4: capabilities?.supportsMp4 ?? true,
      mkv: capabilities?.supportsMkv ?? false,
      hls: capabilities?.supportsHls ?? true,
      dolbyVision: false,
      aac: supportsCodec(capabilities, "aac", "mp4a") ?? true,
      ac3: supportsCodec(capabilities, "ac3", "ac-3") ?? false,
      eac3: supportsCodec(capabilities, "eac3", "ec-3") ?? false,
    },
  };
}

export function getCastSessionProfile(
  deviceProfile: DeviceProfile,
  capabilities?: CastDeviceCapabilities,
): PlaybackSessionCastProfile {
  const supportedCodecs =
    capabilities?.supportedCodecs ??
    [
      deviceProfile.supports.h264 ? "h264" : null,
      deviceProfile.supports.h265 ? "h265" : null,
      deviceProfile.supports.av1 ? "av1" : null,
      deviceProfile.supports.aac ? "aac" : null,
      deviceProfile.supports.ac3 ? "ac3" : null,
      deviceProfile.supports.eac3 ? "eac3" : null,
    ].filter((codec): codec is string => !!codec);

  return {
    supportsHls: deviceProfile.supports.hls,
    supportsMp4: deviceProfile.supports.mp4,
    supportsMkv: deviceProfile.supports.mkv,
    supportedCodecs,
    canAccessLocalhost: capabilities?.canAccessLocalhost ?? false,
    requiresRemoteReachableUrl:
      capabilities?.requiresRemoteReachableUrl ?? true,
    remuxAllowed: capabilities?.remuxAllowed ?? true,
  };
}

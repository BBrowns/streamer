import { Platform } from "react-native";
import Constants from "expo-constants";
import type { Stream } from "@streamer/shared";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";

export type DownloadEligibilityMode =
  | "direct-file"
  | "bridge-torrent"
  | "browser-external"
  | "unsupported";

export interface DownloadEligibility {
  mode: DownloadEligibilityMode;
  canDownload: boolean;
  offlinePlayable: boolean;
  reason?: string;
}

function normalizeHost(host: string) {
  const normalized = host.trim().toLowerCase();
  return normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;
}

function isLoopbackHost(host: string) {
  const normalized = normalizeHost(host);
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized.startsWith("127.")
  );
}

function isLocalIosSimulator() {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (!host) return false;
  return isLoopbackHost(host);
}

function isBridgeUrlReachableForNativeDownload(bridgeUrl: string) {
  if (Platform.OS === "web") return true;

  let parsed: URL;
  try {
    parsed = new URL(bridgeUrl);
  } catch {
    return false;
  }

  const host = normalizeHost(parsed.hostname);
  if (Platform.OS === "android" && host === "10.0.2.2") {
    return true;
  }

  if (Platform.OS === "ios" && isLoopbackHost(host)) {
    return isLocalIosSimulator();
  }

  return !isLoopbackHost(host);
}

export function getDownloadEligibility(stream: Stream): DownloadEligibility {
  const url = stream.url?.toLowerCase() ?? "";
  const externalUrl = stream.externalUrl?.toLowerCase() ?? "";
  const isHls = url.includes(".m3u8") || externalUrl.includes(".m3u8");

  if (isHls) {
    return {
      mode: "unsupported",
      canDownload: false,
      offlinePlayable: false,
      reason: "HLS streams are streaming-only in offline v1.",
    };
  }

  if (stream.infoHash) {
    const bridgeReady =
      streamEngineManager.bridgeAvailable &&
      streamEngineManager.bridgeStatus === "available";
    const bridgeUrl = streamEngineManager.getBridgeUrl();
    const bridgeReachable =
      bridgeReady && isBridgeUrlReachableForNativeDownload(bridgeUrl);
    return {
      mode: "bridge-torrent",
      canDownload: bridgeReachable,
      offlinePlayable: bridgeReachable,
      reason: bridgeReachable
        ? undefined
        : bridgeReady
          ? "Torrent downloads on this device need the desktop bridge LAN URL."
          : "Torrent downloads need the desktop stream bridge.",
    };
  }

  if (stream.url) {
    return {
      mode: "direct-file",
      canDownload: true,
      offlinePlayable: true,
    };
  }

  if (stream.externalUrl) {
    return {
      mode: "browser-external",
      canDownload: Platform.OS === "web",
      offlinePlayable: false,
      reason: "External browser downloads cannot be verified offline.",
    };
  }

  return {
    mode: "unsupported",
    canDownload: false,
    offlinePlayable: false,
    reason: "This source does not expose a downloadable file.",
  };
}

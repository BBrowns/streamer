import { Platform } from "react-native";
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
    return {
      mode: "bridge-torrent",
      canDownload: bridgeReady,
      offlinePlayable: bridgeReady,
      reason: bridgeReady
        ? undefined
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

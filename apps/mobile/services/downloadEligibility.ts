import { Platform } from "react-native";
import type { Stream } from "@streamer/shared";
import {
  buildActionBridgeHint,
  preflightStreamAction,
} from "./actionPreflight";

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

export function isBridgeUrlReachableForNativeDownload(bridgeUrl: string) {
  return (
    buildActionBridgeHint({ url: bridgeUrl }).endpoint?.deviceReachable === true
  );
}

export function getDownloadEligibility(stream: Stream): DownloadEligibility {
  const url = stream.url?.toLowerCase() ?? "";
  const externalUrl = stream.externalUrl?.toLowerCase() ?? "";
  const isHls = url.includes(".m3u8") || externalUrl.includes(".m3u8");

  if (isHls) {
    const preflight = preflightStreamAction("download", stream);
    return {
      mode: "unsupported",
      canDownload: false,
      offlinePlayable: false,
      reason: preflight.message,
    };
  }

  if (stream.infoHash) {
    const preflight = preflightStreamAction("download", stream);
    return {
      mode: "bridge-torrent",
      canDownload: preflight.ready,
      offlinePlayable: preflight.ready,
      reason: preflight.ready ? undefined : preflight.message,
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

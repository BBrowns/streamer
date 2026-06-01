import type { BridgeStatus } from "./StreamEngineManager";

export type BridgeStatusTone = "success" | "warning" | "error" | "neutral";

export interface BridgeStatusContext {
  reason?: string;
  message?: string;
  processArch?: string;
  platform?: string;
}

export interface BridgeStatusPresentation {
  title: string;
  detail: string;
  badge: string;
  tone: BridgeStatusTone;
}

export function getBridgeStatusPresentation(
  status: BridgeStatus,
  context: BridgeStatusContext = {},
): BridgeStatusPresentation {
  switch (status) {
    case "available":
      return {
        title: "Bridge ready",
        detail: "Desktop playback, downloads, and casting can use this bridge.",
        badge: "Bridge ready",
        tone: "success",
      };
    case "unsupported":
      return {
        title: "Bridge needs repair",
        detail:
          context.reason === "native-architecture-mismatch"
            ? "The desktop bridge is running, but the torrent engine was installed for a different processor architecture. Reinstall dependencies with the same Node/Electron architecture, then restart the desktop app."
            : "The desktop bridge is reachable, but its torrent engine cannot start. Reinstall the desktop dependencies for this machine, then restart the app.",
        badge: "Repair needed",
        tone: "error",
      };
    case "wrong-url":
      return {
        title: "Check bridge URL",
        detail:
          "The bridge URL is not valid. Paste the LAN URL shown by the desktop app.",
        badge: "Check URL",
        tone: "warning",
      };
    case "loading":
      return {
        title: "Checking bridge",
        detail: "Checking whether the desktop bridge is reachable.",
        badge: "Checking",
        tone: "neutral",
      };
    case "no-peers":
      return {
        title: "Waiting for peers",
        detail:
          "The bridge is running, but this torrent does not have enough peers yet.",
        badge: "No peers",
        tone: "warning",
      };
    case "unreachable":
    default:
      return {
        title: "Bridge not connected",
        detail:
          "Start the desktop app and make sure mobile uses the LAN URL shown in Sources & Devices.",
        badge: "Needs bridge",
        tone: "warning",
      };
  }
}

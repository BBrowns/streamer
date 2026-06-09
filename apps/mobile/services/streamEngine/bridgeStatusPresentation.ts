import type {
  BridgeRepairPlan,
  BridgeSelfTest,
  BridgeStatus,
} from "./StreamEngineManager";

export type BridgeStatusTone = "success" | "warning" | "error" | "neutral";

export interface BridgeStatusContext {
  reason?: string;
  message?: string;
  processArch?: string;
  runtimeArch?: string;
  nativeArch?: string;
  platform?: string;
  selfTest?: BridgeSelfTest;
  repair?: BridgeRepairPlan;
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
        detail:
          context.selfTest?.status === "pass"
            ? "Desktop playback, downloads, and casting can use this bridge. Runtime self-test passed."
            : "Desktop playback, downloads, and casting can use this bridge.",
        badge: "Bridge ready",
        tone: "success",
      };
    case "unsupported":
      return {
        title: "Bridge needs repair",
        detail:
          context.repair?.detail ||
          (context.reason === "native-architecture-mismatch"
            ? `The desktop bridge is running, but the torrent engine was installed for a different processor architecture${
                context.runtimeArch && context.nativeArch
                  ? ` (${context.runtimeArch} vs ${context.nativeArch})`
                  : ""
              }. Reinstall dependencies with the same Node/Electron architecture, then restart the desktop app.`
            : "The desktop bridge is reachable, but its torrent engine cannot start. Use the repair steps below, then restart the app."),
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

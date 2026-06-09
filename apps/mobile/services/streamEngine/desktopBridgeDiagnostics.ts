import type { DesktopBridgeInfo } from "../desktop-bridge";
import type {
  BridgeDiagnostics,
  BridgeRepairPlan,
  BridgeSelfTest,
  BridgeStatus,
} from "./StreamEngineManager";

type HealthRecord = {
  torrentEngine?: {
    available?: boolean;
    reason?: string;
    message?: string;
    processArch?: string;
    platform?: string;
  };
  runtime?: {
    nodeArch?: string;
    nativeArch?: string;
    processArch?: string;
    platform?: string;
    architectureMismatch?: boolean;
  };
  selfTest?: BridgeSelfTest;
  repair?: BridgeRepairPlan;
};

function asHealthRecord(value: unknown): HealthRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as HealthRecord;
}

function repairPlanForReason(
  reason?: string | null,
): BridgeRepairPlan | undefined {
  switch (reason) {
    case "native-architecture-mismatch":
      return {
        required: true,
        reason,
        title: "Bridge runtime architecture mismatch",
        detail:
          "The bridge runtime and native torrent module were built for different CPU architectures.",
        actionLabel: "Repair runtime",
        steps: [
          "Install a Node.js runtime that matches the native module architecture.",
          "On Apple Silicon, prefer arm64 Node.js.",
          "Or set STREAMER_BRIDGE_NODE to the matching Node binary.",
          "Restart the desktop app.",
        ],
      };
    case "native-load-failed":
      return {
        required: true,
        reason,
        title: "Native torrent module failed to load",
        detail:
          "The desktop bridge cannot load node-datachannel for this runtime.",
        actionLabel: "Rebuild dependencies",
        steps: [
          "Stop the desktop app.",
          "Reinstall dependencies from the repository root.",
          "Rebuild node-datachannel if needed.",
          "Restart the desktop app.",
        ],
      };
    case "missing-stream-server-build":
      return {
        required: true,
        reason,
        title: "Stream bridge build is missing",
        detail: "The desktop shell cannot find the stream-server build output.",
        actionLabel: "Build bridge",
        steps: [
          "Run npm run build --workspace=@streamer/stream-server.",
          "Restart the desktop app.",
          "For packaged builds, verify stream-server is included as a resource.",
        ],
      };
    case "bridge-port-owned-by-other-process":
      return {
        required: true,
        reason,
        title: "Bridge port is already in use",
        detail: "Another process is using port 11470.",
        actionLabel: "Reclaim port",
        steps: [
          "Close other Streamer instances.",
          "Restart the desktop app.",
          "If needed, stop the process using port 11470.",
        ],
      };
    default:
      return undefined;
  }
}

function resolveDesktopBridgeStatus(
  diagnostics: NonNullable<DesktopBridgeInfo["diagnostics"]>,
  info: DesktopBridgeInfo,
): BridgeStatus {
  const health = asHealthRecord(diagnostics.health);
  if (health?.repair?.required || diagnostics.repair?.required) {
    return "unsupported";
  }
  if (
    health?.selfTest?.status === "fail" ||
    diagnostics.selfTest?.status === "fail"
  ) {
    return "unsupported";
  }
  if (health?.torrentEngine?.available === false) return "unsupported";

  switch (diagnostics.status) {
    case "running":
      return info.available ? "available" : "loading";
    case "starting":
      return "loading";
    case "error":
      return "unsupported";
    case "stopped":
      return "unreachable";
    default:
      return info.available ? "available" : "unreachable";
  }
}

export function diagnosticsFromDesktopBridge(
  info: DesktopBridgeInfo | null,
): BridgeDiagnostics | null {
  const diagnostics = info?.diagnostics;
  if (!info || !diagnostics) return null;

  const health = asHealthRecord(diagnostics.health);
  const torrentEngine = health?.torrentEngine;
  const runtime = health?.runtime;
  const reason =
    health?.repair?.reason ||
    diagnostics.repair?.reason ||
    torrentEngine?.reason ||
    diagnostics.reason ||
    undefined;
  const repair =
    health?.repair ||
    diagnostics.repair ||
    repairPlanForReason(reason) ||
    undefined;
  const selfTest = health?.selfTest || diagnostics.selfTest || undefined;

  return {
    status: resolveDesktopBridgeStatus(diagnostics, info),
    url: info.localUrl || info.lanUrl,
    reason,
    message:
      repair?.detail ||
      torrentEngine?.message ||
      diagnostics.message ||
      diagnostics.error ||
      selfTest?.summary ||
      undefined,
    processArch:
      torrentEngine?.processArch ||
      runtime?.processArch ||
      diagnostics.processArch ||
      diagnostics.nodeArch ||
      undefined,
    runtimeArch: runtime?.nodeArch || diagnostics.nodeArch || undefined,
    nativeArch: runtime?.nativeArch || diagnostics.nativeArch || undefined,
    platform:
      torrentEngine?.platform || runtime?.platform || diagnostics.platform,
    selfTest,
    repair,
    checkedAt: diagnostics.updatedAt || selfTest?.checkedAt,
  };
}

import type { DesktopBridgeInfo } from "../desktop-bridge";
import type { BridgeDiagnostics, BridgeStatus } from "./StreamEngineManager";

type HealthRecord = {
  torrentEngine?: {
    available?: boolean;
    reason?: string;
    message?: string;
    processArch?: string;
    platform?: string;
  };
};

function asHealthRecord(value: unknown): HealthRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as HealthRecord;
}

function resolveDesktopBridgeStatus(
  diagnostics: NonNullable<DesktopBridgeInfo["diagnostics"]>,
  info: DesktopBridgeInfo,
): BridgeStatus {
  const health = asHealthRecord(diagnostics.health);
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

  return {
    status: resolveDesktopBridgeStatus(diagnostics, info),
    url: info.localUrl || info.lanUrl,
    reason: torrentEngine?.reason || diagnostics.reason || undefined,
    message:
      torrentEngine?.message ||
      diagnostics.message ||
      diagnostics.error ||
      undefined,
    processArch:
      torrentEngine?.processArch ||
      diagnostics.processArch ||
      diagnostics.nodeArch ||
      undefined,
    platform: torrentEngine?.platform || diagnostics.platform,
    checkedAt: diagnostics.updatedAt,
  };
}

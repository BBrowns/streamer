import type {
  ActionPreflightReason,
  ActionPreflightResult,
  PlaybackErrorCode,
} from "@streamer/shared";
import type {
  CastFailureReason,
  CastRecoveryGuidance,
  DownloadFailureReason,
  DownloadRecoveryGuidance,
} from "../types/actionRecovery";

interface DownloadRecoveryTask {
  status: string;
  error?: string;
  localUri?: string;
  offlineVerifiedAt?: string;
  failureReason?: DownloadFailureReason;
}

interface RecoveryErrorShape {
  message?: string;
  code?: string;
  preflight?: ActionPreflightResult;
}

const BRIDGE_PREFLIGHT_REASONS = new Set<ActionPreflightReason>([
  "bridge_not_configured",
  "bridge_checking",
  "bridge_url_invalid",
  "bridge_loopback_unreachable",
  "bridge_unreachable",
  "bridge_auth_required",
  "bridge_runtime_unsupported",
  "gateway_unavailable",
  "torrent_engine_unavailable",
  "remux_unavailable",
  "cast_service_unavailable",
]);

function errorShape(error: unknown): RecoveryErrorShape {
  if (!error || typeof error !== "object") {
    return { message: typeof error === "string" ? error : undefined };
  }
  return error as RecoveryErrorShape;
}

function errorText(error: unknown) {
  const value = errorShape(error);
  return `${value.code || ""} ${value.message || ""}`.trim().toLowerCase();
}

function runtimeCode(error: unknown): PlaybackErrorCode | undefined {
  const code = errorShape(error).code;
  return code &&
    [
      "NO_SOURCES",
      "NO_PLAYABLE_SOURCE",
      "NO_PEERS",
      "BRIDGE_UNAVAILABLE",
      "BRIDGE_UNSUPPORTED",
      "UNSUPPORTED_CODEC",
      "GATEWAY_TIMEOUT",
      "SOURCE_UNAVAILABLE",
      "NETWORK_OFFLINE",
      "PLAYBACK_TIMEOUT",
      "UNKNOWN",
    ].includes(code)
    ? (code as PlaybackErrorCode)
    : undefined;
}

export function classifyDownloadFailure(
  error: unknown,
  preflightReason?: ActionPreflightReason,
): DownloadFailureReason {
  const shape = errorShape(error);
  const preflight = preflightReason ?? shape.preflight?.reason;
  const text = errorText(error);

  if (preflight && BRIDGE_PREFLIGHT_REASONS.has(preflight)) {
    return "bridge_unavailable";
  }
  if (
    runtimeCode(error) === "BRIDGE_UNAVAILABLE" ||
    runtimeCode(error) === "BRIDGE_UNSUPPORTED" ||
    /bridge|torrent engine|gateway unavailable|architecture mismatch/.test(text)
  ) {
    return "bridge_unavailable";
  }
  if (
    /enospc|no space|disk full|storage (?:is )?full|not enough (?:disk )?space/.test(
      text,
    )
  ) {
    return "storage_pressure";
  }
  if (
    /missing|could not be found|local file vanished|cannot verify|could not be verified/.test(
      text,
    )
  ) {
    return "missing_file";
  }
  if (/\b(?:401|403|410)\b|forbidden|gone|expired|signed url/.test(text)) {
    return "source_expired";
  }
  if (
    preflight === "hls_offline_unsupported" ||
    preflight === "source_unsupported" ||
    /hls downloads|streaming-only|cannot be saved|does not expose a downloadable/.test(
      text,
    )
  ) {
    return "source_unsupported";
  }
  if (/interrupted|cancelled|canceled|paused|econnreset|network/.test(text)) {
    return "interrupted";
  }
  return "failed";
}

export function getDownloadRecovery(
  task: DownloadRecoveryTask,
): DownloadRecoveryGuidance | null {
  if (task.status === "Paused") {
    return {
      reason: "paused",
      action: "retry",
      title: "Download paused",
      message: "Continue this download from its saved progress when possible.",
      actionLabel: "Resume",
    };
  }
  if (task.status === "Completed" && !task.localUri) {
    return {
      reason: "missing_file",
      action: "replan",
      title: "Offline file is missing",
      message:
        "No managed file is available on this device. Prepare a fresh download.",
      actionLabel: "Download again",
    };
  }
  if (task.status === "Completed" && task.localUri && !task.offlineVerifiedAt) {
    return {
      reason: "verification_required",
      action: "verify",
      title: "File needs verification",
      message:
        "Check that the saved file still exists before using it offline.",
      actionLabel: "Verify file",
    };
  }
  if (task.status !== "Error") return null;

  const reason =
    task.failureReason ??
    classifyDownloadFailure(task.error || "Download failed");
  const guidance: Record<DownloadFailureReason, DownloadRecoveryGuidance> = {
    interrupted: {
      reason,
      action: "retry",
      title: "Download interrupted",
      message: "The transfer stopped before the file was ready offline.",
      actionLabel: "Resume",
    },
    missing_file: {
      reason,
      action: "replan",
      title: "Offline file is missing",
      message:
        "The saved file is no longer on this device. Prepare a fresh download.",
      actionLabel: "Download again",
    },
    storage_pressure: {
      reason,
      action: "free_storage",
      title: "Not enough storage",
      message:
        "Remove an offline title or free device storage before retrying.",
      actionLabel: "Free space",
    },
    bridge_unavailable: {
      reason,
      action: "repair_bridge",
      title: "Desktop bridge needs attention",
      message:
        "Reconnect or repair the desktop bridge before retrying this download.",
      actionLabel: "Repair bridge",
    },
    source_expired: {
      reason,
      action: "replan",
      title: "Download source expired",
      message: "Prepare a fresh source instead of reusing the expired address.",
      actionLabel: "Prepare again",
    },
    source_unsupported: {
      reason,
      action: "remove",
      title: "Source cannot be saved offline",
      message:
        "This source is streaming-only. Remove it from the offline queue.",
      actionLabel: "Remove",
    },
    failed: {
      reason,
      action: "retry",
      title: "Download needs attention",
      message: "Retry the download with a newly prepared source if needed.",
      actionLabel: "Retry",
    },
  };
  return guidance[reason];
}

function castReason(error: unknown): CastFailureReason {
  const shape = errorShape(error);
  const preflight = shape.preflight?.reason;
  const code = runtimeCode(error);
  const text = errorText(error);

  if (
    preflight === "remux_unavailable" ||
    /remux|required conversion/.test(text)
  ) {
    return "remux_required";
  }
  if (preflight && BRIDGE_PREFLIGHT_REASONS.has(preflight)) {
    return "bridge_unavailable";
  }
  if (code === "BRIDGE_UNAVAILABLE" || code === "BRIDGE_UNSUPPORTED") {
    return "bridge_unavailable";
  }
  if (shape.code === "CAST_BRIDGE_REJECTED") {
    return "bridge_unavailable";
  }
  if (
    preflight === "cast_source_loopback" ||
    /localhost|loopback-only|cannot access a source that only exists/.test(text)
  ) {
    return "source_loopback";
  }
  if (
    shape.code === "CAST_DEVICES_UNREACHABLE" ||
    /search for displays|fetch cast devices|discovery/.test(text)
  ) {
    return "devices_unreachable";
  }
  if (
    shape.code === "CAST_DEVICE_UNREACHABLE" ||
    /device not found|device unreachable|econnrefused|timed out connecting/.test(
      text,
    )
  ) {
    return "device_unreachable";
  }
  if (
    code === "UNSUPPORTED_CODEC" ||
    shape.code === "CAST_SOURCE_REJECTED" ||
    preflight === "cast_source_unreachable" ||
    /incompatible|unsupported (?:codec|container|source)/.test(text)
  ) {
    return "source_incompatible";
  }
  return "failed";
}

export function getCastRecovery(
  error: unknown,
  options: { hasDeviceCapabilities?: boolean } = {},
): CastRecoveryGuidance {
  const reason = castReason(error);
  const guidance: Record<CastFailureReason, CastRecoveryGuidance> = {
    devices_unreachable: {
      reason,
      action: "refresh_devices",
      title: "Displays could not be reached",
      message: "Check the local network and search for displays again.",
      actionLabel: "Search again",
    },
    device_unreachable: {
      reason,
      action: "refresh_devices",
      title: "Display is no longer reachable",
      message: "Refresh the device list before trying to cast again.",
      actionLabel: "Refresh displays",
    },
    source_incompatible: {
      reason,
      action: options.hasDeviceCapabilities
        ? "choose_compatible_device"
        : "replan",
      title: "Source is not compatible",
      message: "This display cannot play the prepared source.",
      actionLabel: options.hasDeviceCapabilities
        ? "Choose compatible display"
        : "Try another source",
    },
    source_loopback: {
      reason,
      action: "replan",
      title: "Display cannot reach this source",
      message: "Prepare a LAN-reachable source instead of sending localhost.",
      actionLabel: "Prepare another source",
    },
    remux_required: {
      reason,
      action: "repair_bridge",
      title: "Compatible stream cannot be prepared",
      message:
        "The desktop bridge needs its remux runtime to convert this source.",
      actionLabel: "Check bridge",
    },
    bridge_unavailable: {
      reason,
      action: "repair_bridge",
      title: "Desktop bridge needs attention",
      message: "Reconnect or repair the desktop bridge before casting again.",
      actionLabel: "Repair bridge",
    },
    failed: {
      reason,
      action: "retry",
      title: "Casting did not start",
      message: "The display or prepared source could not start casting.",
      actionLabel: "Try again",
    },
  };
  return guidance[reason];
}

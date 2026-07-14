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
import i18n from "../lib/i18n";

function recoveryCopy(key: string): string {
  return i18n.t(key) as string;
}

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
      title: recoveryCopy("downloads.recovery.pausedTitle"),
      message: recoveryCopy("downloads.recovery.pausedMessage"),
      actionLabel: recoveryCopy("downloads.recovery.resumeAction"),
    };
  }
  if (task.status === "Completed" && !task.localUri) {
    return {
      reason: "missing_file",
      action: "replan",
      title: recoveryCopy("downloads.recovery.missingTitle"),
      message: recoveryCopy("downloads.recovery.noManagedFileMessage"),
      actionLabel: recoveryCopy("downloads.recovery.downloadAgainAction"),
    };
  }
  if (task.status === "Completed" && task.localUri && !task.offlineVerifiedAt) {
    return {
      reason: "verification_required",
      action: "verify",
      title: recoveryCopy("downloads.recovery.verificationTitle"),
      message: recoveryCopy("downloads.recovery.verificationMessage"),
      actionLabel: recoveryCopy("downloads.recovery.verifyAction"),
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
      title: recoveryCopy("downloads.recovery.interruptedTitle"),
      message: recoveryCopy("downloads.recovery.interruptedMessage"),
      actionLabel: recoveryCopy("downloads.recovery.resumeAction"),
    },
    missing_file: {
      reason,
      action: "replan",
      title: recoveryCopy("downloads.recovery.missingTitle"),
      message: recoveryCopy("downloads.recovery.missingFileMessage"),
      actionLabel: recoveryCopy("downloads.recovery.downloadAgainAction"),
    },
    storage_pressure: {
      reason,
      action: "free_storage",
      title: recoveryCopy("downloads.recovery.storageTitle"),
      message: recoveryCopy("downloads.recovery.storageMessage"),
      actionLabel: recoveryCopy("downloads.recovery.freeSpaceAction"),
    },
    bridge_unavailable: {
      reason,
      action: "repair_bridge",
      title: recoveryCopy("downloads.recovery.setupTitle"),
      message: recoveryCopy("downloads.recovery.setupMessage"),
      actionLabel: recoveryCopy("downloads.recovery.reviewSetupAction"),
    },
    source_expired: {
      reason,
      action: "replan",
      title: recoveryCopy("downloads.recovery.expiredTitle"),
      message: recoveryCopy("downloads.recovery.expiredMessage"),
      actionLabel: recoveryCopy("downloads.recovery.prepareAgainAction"),
    },
    source_unsupported: {
      reason,
      action: "remove",
      title: recoveryCopy("downloads.recovery.unsupportedTitle"),
      message: recoveryCopy("downloads.recovery.unsupportedMessage"),
      actionLabel: recoveryCopy("downloads.recovery.removeAction"),
    },
    failed: {
      reason,
      action: "retry",
      title: recoveryCopy("downloads.recovery.failedTitle"),
      message: recoveryCopy("downloads.recovery.failedMessage"),
      actionLabel: recoveryCopy("downloads.recovery.retryAction"),
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
      title: recoveryCopy("player.castRecovery.devicesTitle"),
      message: recoveryCopy("player.castRecovery.devicesMessage"),
      actionLabel: recoveryCopy("player.castRecovery.searchAgainAction"),
    },
    device_unreachable: {
      reason,
      action: "refresh_devices",
      title: recoveryCopy("player.castRecovery.deviceTitle"),
      message: recoveryCopy("player.castRecovery.deviceMessage"),
      actionLabel: recoveryCopy("player.castRecovery.refreshAction"),
    },
    source_incompatible: {
      reason,
      action: options.hasDeviceCapabilities
        ? "choose_compatible_device"
        : "replan",
      title: recoveryCopy("player.castRecovery.incompatibleTitle"),
      message: recoveryCopy("player.castRecovery.incompatibleMessage"),
      actionLabel: options.hasDeviceCapabilities
        ? recoveryCopy("player.castRecovery.chooseDisplayAction")
        : recoveryCopy("player.castRecovery.tryAnotherAction"),
    },
    source_loopback: {
      reason,
      action: "replan",
      title: recoveryCopy("player.castRecovery.sourceReachTitle"),
      message: recoveryCopy("player.castRecovery.sourceReachMessage"),
      actionLabel: recoveryCopy("player.castRecovery.prepareAnotherAction"),
    },
    remux_required: {
      reason,
      action: "repair_bridge",
      title: recoveryCopy("player.castRecovery.supportTitle"),
      message: recoveryCopy("player.castRecovery.supportMessage"),
      actionLabel: recoveryCopy("player.castRecovery.reviewSetupAction"),
    },
    bridge_unavailable: {
      reason,
      action: "repair_bridge",
      title: recoveryCopy("player.castRecovery.setupTitle"),
      message: recoveryCopy("player.castRecovery.setupMessage"),
      actionLabel: recoveryCopy("player.castRecovery.reviewSetupAction"),
    },
    failed: {
      reason,
      action: "retry",
      title: recoveryCopy("player.castRecovery.failedTitle"),
      message: recoveryCopy("player.castRecovery.failedMessage"),
      actionLabel: recoveryCopy("player.castRecovery.tryAgainAction"),
    },
  };
  return guidance[reason];
}

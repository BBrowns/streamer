export type RecoveryAction =
  | "retry"
  | "replan"
  | "verify"
  | "repair_bridge"
  | "free_storage"
  | "refresh_devices"
  | "choose_compatible_device"
  | "remove"
  | "cancel";

export type DownloadFailureReason =
  | "interrupted"
  | "missing_file"
  | "storage_pressure"
  | "bridge_unavailable"
  | "source_expired"
  | "source_unsupported"
  | "invalid_media"
  | "failed";

export type CastFailureReason =
  | "devices_unreachable"
  | "device_unreachable"
  | "source_incompatible"
  | "source_loopback"
  | "remux_required"
  | "bridge_unavailable"
  | "failed";

export interface RecoveryGuidance<Reason extends string> {
  reason: Reason;
  action: RecoveryAction;
  title: string;
  message: string;
  actionLabel: string;
}

export type DownloadRecoveryGuidance = RecoveryGuidance<
  DownloadFailureReason | "verification_required" | "paused"
>;

export type CastRecoveryGuidance = RecoveryGuidance<CastFailureReason>;

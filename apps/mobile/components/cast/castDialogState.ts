import type { CastDevice } from "../../services/CastService";
import type {
  CastOrchestratorSuccess,
  PlaybackOrchestratorFailure,
} from "../../services/playback/PlaybackOrchestrator";
import type { CastRecoveryGuidance } from "../../types/actionRecovery";

interface CastDialogStateBase {
  devices: CastDevice[];
}

export type CastDialogState =
  | (CastDialogStateBase & {
      status: "discovering";
    })
  | (CastDialogStateBase & {
      status: "noDevices";
    })
  | (CastDialogStateBase & {
      status: "preparing";
      device?: CastDevice;
      reason: "initial" | "device" | "fallback";
    })
  | (CastDialogStateBase & {
      status: "ready";
      source?: CastOrchestratorSuccess;
    })
  | (CastDialogStateBase & {
      status: "preparationFailure";
      recovery: CastRecoveryGuidance;
      canTryAnotherSource: boolean;
      source?: CastOrchestratorSuccess;
      device?: CastDevice;
    })
  | (CastDialogStateBase & {
      status: "unsupportedDevice";
      recovery: CastRecoveryGuidance;
      canTryAnotherSource: boolean;
      source?: CastOrchestratorSuccess;
      rejectedDeviceId?: string;
      showDevicePicker: boolean;
    })
  | (CastDialogStateBase & {
      status: "casting";
      device: CastDevice;
      source?: CastOrchestratorSuccess;
      tryingFallback: boolean;
    })
  | (CastDialogStateBase & {
      status: "connectionFailure";
      recovery: CastRecoveryGuidance;
      phase: "discovery" | "connection";
      device?: CastDevice;
      source?: CastOrchestratorSuccess;
    })
  | (CastDialogStateBase & {
      status: "connected";
      device: CastDevice;
      source?: CastOrchestratorSuccess;
      sessionId?: string;
    });

export type CastDialogAction =
  | { type: "discoveryStarted" }
  | { type: "discoveryEmpty" }
  | {
      type: "discoveryFailed";
      recovery: CastRecoveryGuidance;
    }
  | {
      type: "preparationStarted";
      devices: CastDevice[];
      device?: CastDevice;
      reason: "initial" | "device" | "fallback";
    }
  | {
      type: "sourceReady";
      devices: CastDevice[];
      source?: CastOrchestratorSuccess;
    }
  | {
      type: "preparationFailed";
      devices: CastDevice[];
      recovery: CastRecoveryGuidance;
      canTryAnotherSource: boolean;
      device?: CastDevice;
    }
  | { type: "devicePickerOpened" }
  | {
      type: "castStarted";
      devices: CastDevice[];
      device: CastDevice;
      source?: CastOrchestratorSuccess;
    }
  | { type: "castFallbackStarted" }
  | {
      type: "castFailed";
      devices: CastDevice[];
      device: CastDevice;
      source?: CastOrchestratorSuccess;
      recovery: CastRecoveryGuidance;
      canTryAnotherSource: boolean;
    }
  | {
      type: "castConnected";
      devices: CastDevice[];
      device: CastDevice;
      source?: CastOrchestratorSuccess;
      sessionId?: string;
    };

export const initialCastDialogState: CastDialogState = {
  status: "discovering",
  devices: [],
};

const PREPARATION_FAILURE_REASONS = new Set<CastRecoveryGuidance["reason"]>([
  "source_loopback",
  "remux_required",
  "bridge_unavailable",
]);

export function castDialogReducer(
  state: CastDialogState,
  action: CastDialogAction,
): CastDialogState {
  switch (action.type) {
    case "discoveryStarted":
      return initialCastDialogState;
    case "discoveryEmpty":
      return { status: "noDevices", devices: [] };
    case "discoveryFailed":
      return {
        status: "connectionFailure",
        devices: [],
        phase: "discovery",
        recovery: action.recovery,
      };
    case "preparationStarted":
      return {
        status: "preparing",
        devices: action.devices,
        device: action.device,
        reason: action.reason,
      };
    case "sourceReady":
      return {
        status: "ready",
        devices: action.devices,
        source: action.source,
      };
    case "preparationFailed":
      if (action.recovery.reason === "source_incompatible") {
        return {
          status: "unsupportedDevice",
          devices: action.devices,
          recovery: action.recovery,
          canTryAnotherSource: action.canTryAnotherSource,
          rejectedDeviceId: action.device?.id,
          showDevicePicker: false,
        };
      }
      return {
        status: "preparationFailure",
        devices: action.devices,
        recovery: action.recovery,
        canTryAnotherSource: action.canTryAnotherSource,
        device: action.device,
      };
    case "devicePickerOpened":
      return state.status === "unsupportedDevice"
        ? { ...state, showDevicePicker: true }
        : state;
    case "castStarted":
      return {
        status: "casting",
        devices: action.devices,
        device: action.device,
        source: action.source,
        tryingFallback: false,
      };
    case "castFallbackStarted":
      return state.status === "casting"
        ? { ...state, tryingFallback: true }
        : state;
    case "castFailed":
      if (action.recovery.reason === "source_incompatible") {
        return {
          status: "unsupportedDevice",
          devices: action.devices,
          recovery: action.recovery,
          canTryAnotherSource: action.canTryAnotherSource,
          source: action.source,
          rejectedDeviceId: action.device.id,
          showDevicePicker: false,
        };
      }
      if (PREPARATION_FAILURE_REASONS.has(action.recovery.reason)) {
        return {
          status: "preparationFailure",
          devices: action.devices,
          recovery: action.recovery,
          canTryAnotherSource: action.canTryAnotherSource,
          source: action.source,
          device: action.device,
        };
      }
      return {
        status: "connectionFailure",
        devices: action.devices,
        phase: "connection",
        recovery: action.recovery,
        device: action.device,
        source: action.source,
      };
    case "castConnected":
      return {
        status: "connected",
        devices: action.devices,
        device: action.device,
        source: action.source,
        sessionId: action.sessionId,
      };
  }
}

/**
 * A retry is only presented as "another source" when the planner explicitly
 * reports a fallback and that candidate is eligible for casting. Merely
 * receiving a retryable error is not enough to promise a usable alternative.
 */
export function hasUsableCastFallback(
  result: Pick<PlaybackOrchestratorFailure, "error" | "plan">,
): boolean {
  return Boolean(
    result.error.shouldFallback &&
    result.plan?.fallbackCandidates.some(
      (candidate) =>
        candidate.actionEligibility.action === "cast" &&
        candidate.actionEligibility.eligible,
    ),
  );
}

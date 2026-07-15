import { createPlaybackRuntimeError } from "../../../services/playback/PlaybackErrors";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../../test-utils/playbackPlan";
import type { CastRecoveryGuidance } from "../../../types/actionRecovery";
import {
  castDialogReducer,
  hasUsableCastFallback,
  initialCastDialogState,
  type CastDialogState,
} from "../castDialogState";

const device = {
  id: "living-room",
  name: "Living Room",
  type: "chromecast",
};

function recovery(
  reason: CastRecoveryGuidance["reason"],
  action: CastRecoveryGuidance["action"] = "retry",
): CastRecoveryGuidance {
  return {
    reason,
    action,
    title: `${reason} title`,
    message: `${reason} message`,
    actionLabel: `${action} action`,
  };
}

describe("castDialogReducer", () => {
  it("uses one exclusive state for every cast phase", () => {
    const statuses = new Set<CastDialogState["status"]>();
    let state = initialCastDialogState;
    statuses.add(state.status);

    state = castDialogReducer(state, { type: "discoveryEmpty" });
    statuses.add(state.status);
    state = castDialogReducer(state, {
      type: "preparationStarted",
      devices: [device],
      reason: "initial",
    });
    statuses.add(state.status);
    state = castDialogReducer(state, {
      type: "sourceReady",
      devices: [device],
    });
    statuses.add(state.status);
    state = castDialogReducer(state, {
      type: "preparationFailed",
      devices: [device],
      recovery: recovery("failed"),
      canTryAnotherSource: false,
    });
    statuses.add(state.status);
    state = castDialogReducer(state, {
      type: "preparationFailed",
      devices: [device],
      device,
      recovery: recovery("source_incompatible", "choose_compatible_device"),
      canTryAnotherSource: false,
    });
    statuses.add(state.status);
    state = castDialogReducer(state, { type: "devicePickerOpened" });
    expect(state).toMatchObject({
      status: "unsupportedDevice",
      showDevicePicker: true,
    });
    state = castDialogReducer(state, {
      type: "castStarted",
      devices: [device],
      device,
    });
    statuses.add(state.status);
    state = castDialogReducer(state, { type: "castFallbackStarted" });
    expect(state).toMatchObject({ status: "casting", tryingFallback: true });
    state = castDialogReducer(state, {
      type: "castFailed",
      devices: [device],
      device,
      recovery: recovery("failed"),
      canTryAnotherSource: false,
    });
    statuses.add(state.status);
    state = castDialogReducer(state, {
      type: "castConnected",
      devices: [device],
      device,
      sessionId: "session-1",
    });
    statuses.add(state.status);

    expect(statuses).toEqual(
      new Set([
        "discovering",
        "noDevices",
        "preparing",
        "ready",
        "preparationFailure",
        "unsupportedDevice",
        "casting",
        "connectionFailure",
        "connected",
      ]),
    );
  });

  it("keeps discovery, setup, incompatibility, and connection failures distinct", () => {
    const discovery = castDialogReducer(initialCastDialogState, {
      type: "discoveryFailed",
      recovery: recovery("devices_unreachable", "refresh_devices"),
    });
    expect(discovery).toMatchObject({
      status: "connectionFailure",
      phase: "discovery",
      devices: [],
    });

    const setup = castDialogReducer(initialCastDialogState, {
      type: "castFailed",
      devices: [device],
      device,
      recovery: recovery("bridge_unavailable", "repair_bridge"),
      canTryAnotherSource: false,
    });
    expect(setup.status).toBe("preparationFailure");

    const incompatible = castDialogReducer(initialCastDialogState, {
      type: "castFailed",
      devices: [device],
      device,
      recovery: recovery("source_incompatible", "choose_compatible_device"),
      canTryAnotherSource: false,
    });
    expect(incompatible).toMatchObject({
      status: "unsupportedDevice",
      rejectedDeviceId: device.id,
    });

    const connection = castDialogReducer(initialCastDialogState, {
      type: "castFailed",
      devices: [device],
      device,
      recovery: recovery("device_unreachable", "refresh_devices"),
      canTryAnotherSource: false,
    });
    expect(connection).toMatchObject({
      status: "connectionFailure",
      phase: "connection",
    });
  });
});

describe("hasUsableCastFallback", () => {
  const eligibleFallback = makePlannedMediaCandidate({
    id: "00000000-0000-4000-8000-000000000102",
    kind: "direct",
    stream: { url: "https://cdn.example.test/fallback.mp4" },
    actionEligibility: { action: "cast", eligible: true },
  });
  const plan = makePlaybackPlan({
    action: "cast",
    state: "ready",
    fallbackCandidates: [eligibleFallback],
  });

  it("requires both planner fallback intent and an eligible cast candidate", () => {
    expect(
      hasUsableCastFallback({
        plan,
        error: createPlaybackRuntimeError(
          "SOURCE_UNAVAILABLE",
          "Try the fallback.",
          { shouldFallback: true },
        ),
      }),
    ).toBe(true);

    expect(
      hasUsableCastFallback({
        plan,
        error: createPlaybackRuntimeError(
          "SOURCE_UNAVAILABLE",
          "Do not promise a fallback.",
          { shouldFallback: false },
        ),
      }),
    ).toBe(false);
    expect(
      hasUsableCastFallback({
        plan: makePlaybackPlan({ action: "cast", state: "notFound" }),
        error: createPlaybackRuntimeError(
          "SOURCE_UNAVAILABLE",
          "No candidate exists.",
          { shouldFallback: true },
        ),
      }),
    ).toBe(false);
  });
});

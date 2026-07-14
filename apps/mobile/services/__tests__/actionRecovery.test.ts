import {
  classifyDownloadFailure,
  getCastRecovery,
  getDownloadRecovery,
} from "../actionRecovery";

describe("actionRecovery", () => {
  it("classifies storage failures without persisting raw source data", () => {
    expect(classifyDownloadFailure(new Error("write failed: ENOSPC"))).toBe(
      "storage_pressure",
    );
    expect(
      getDownloadRecovery({
        status: "Error",
        error: "write failed: ENOSPC",
      }),
    ).toMatchObject({
      reason: "storage_pressure",
      action: "free_storage",
      actionLabel: "Manage storage",
    });
  });

  it("replans a missing offline file instead of calling it ready", () => {
    expect(
      getDownloadRecovery({
        status: "Error",
        error: "Downloaded file could not be found.",
        failureReason: "missing_file",
      }),
    ).toMatchObject({
      action: "replan",
      actionLabel: "Download again",
    });
  });

  it("replans a completed task that has no managed local file", () => {
    expect(
      getDownloadRecovery({
        status: "Completed",
      }),
    ).toMatchObject({
      reason: "missing_file",
      action: "replan",
      actionLabel: "Download again",
    });
  });

  it("routes shared bridge preflight failures to bridge repair", () => {
    expect(
      getCastRecovery({
        message: "The desktop bridge is not reachable.",
        preflight: {
          action: "cast",
          ready: false,
          reason: "bridge_unreachable",
          message: "The desktop bridge is not reachable.",
          requiresBridge: true,
          retryable: true,
        },
      }),
    ).toMatchObject({
      reason: "bridge_unavailable",
      action: "repair_bridge",
    });
  });

  it("refreshes discovery when the selected cast device disappeared", () => {
    expect(
      getCastRecovery({
        code: "CAST_DEVICE_UNREACHABLE",
        message: "Device not found",
      }),
    ).toMatchObject({
      reason: "device_unreachable",
      action: "refresh_devices",
    });
  });

  it("never retries a loopback-only cast source in place", () => {
    expect(
      getCastRecovery({
        message:
          "The cast device cannot access a source that only exists on localhost.",
      }),
    ).toMatchObject({
      reason: "source_loopback",
      action: "replan",
    });
  });

  it("surfaces a missing remux runtime as a distinct repair state", () => {
    expect(
      getCastRecovery({
        message: "The remux runtime is unavailable.",
        preflight: {
          action: "cast",
          ready: false,
          reason: "remux_unavailable",
          message: "The remux runtime is unavailable.",
          requiresBridge: true,
          retryable: true,
        },
      }),
    ).toMatchObject({
      reason: "remux_required",
      action: "repair_bridge",
    });
  });
});

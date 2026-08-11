import {
  buildPlaybackDiagnostics,
  PlaybackDiagnosticsRecorder,
  toPlaybackDiagnosticBreadcrumb,
} from "../PlaybackDiagnostics";

describe("playback diagnostics", () => {
  it("contains useful state without accepting source identities", () => {
    const rows = buildPlaybackDiagnostics({
      engineType: "torrent",
      sourceKind: "torrent",
      runtimeState: "buffering",
      seekable: true,
      positionSeconds: 91.4,
      durationSeconds: 3600,
      bufferedSeconds: 104.9,
      audioLabel: "English 5.1",
      subtitleLabel: "Nederlands",
    });

    expect(rows).toContainEqual({ label: "Timeline", value: "91s / 3600s" });
    expect(JSON.stringify(rows)).not.toMatch(
      /https?:|magnet:|btih|infohash|playbackUrl|streamURL/i,
    );
  });

  it("records only structured numeric playback observations", () => {
    const recorder = new PlaybackDiagnosticsRecorder();
    recorder.record({ type: "plan_usable", elapsedMs: 420.2 });
    recorder.record({ type: "first_frame", elapsedMs: 950.8 });
    recorder.record({ type: "stall", durationMs: 15_000 });
    recorder.record({ type: "fallback" });
    recorder.record({ type: "seek", outcome: "requested" });
    recorder.record({ type: "seek", outcome: "accepted" });
    recorder.record({
      type: "subtitle_provider",
      outcome: "succeeded",
      latencyMs: 340,
    });

    const snapshot = recorder.snapshot();
    expect(snapshot).toMatchObject({
      timeToUsablePlanMs: 420,
      timeToFirstFrameMs: 951,
      stallCount: 1,
      stallDurationMs: 15_000,
      fallbackCount: 1,
      seeks: { requested: 1, accepted: 1, failed: 0 },
      subtitleProviders: {
        succeeded: 1,
        failed: 0,
        totalLatencyMs: 340,
      },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /https?:|magnet:|btih|infohash|authorization/i,
    );
  });

  it("maps bounded first-frame and fallback milestones to safe breadcrumbs", () => {
    expect(
      toPlaybackDiagnosticBreadcrumb({
        type: "first_frame",
        elapsedMs: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      category: "playback",
      message: "playback.first_frame",
      data: { elapsedMs: 0 },
    });
    expect(
      toPlaybackDiagnosticBreadcrumb({
        type: "stall",
        durationMs: 60 * 60 * 1000,
      }),
    ).toEqual({
      category: "playback",
      message: "playback.stall",
      level: "warning",
      data: { durationMs: 30 * 60 * 1000 },
    });
    expect(toPlaybackDiagnosticBreadcrumb({ type: "fallback" })).toEqual({
      category: "playback",
      message: "playback.fallback",
      level: "warning",
    });
  });

  it("does not turn high-frequency track and seek events into breadcrumbs", () => {
    expect(
      toPlaybackDiagnosticBreadcrumb({
        type: "seek",
        outcome: "accepted",
      }),
    ).toBeNull();
    expect(
      toPlaybackDiagnosticBreadcrumb({
        type: "subtitle_provider",
        outcome: "succeeded",
        latencyMs: 120,
      }),
    ).toBeNull();
  });
});

import {
  buildPlaybackDiagnostics,
  PlaybackDiagnosticsRecorder,
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
});

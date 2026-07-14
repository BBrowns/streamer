import { castService } from "../../CastService";
import {
  advanceCastSessionAfterFailure,
  cancelPlaybackSession,
  markPlaybackSessionCasting,
} from "../PlaybackSessionPlaybackService";
import {
  startCastSession,
  stopCastSession,
} from "../PlaybackSessionCastService";

jest.mock("../../CastService", () => ({
  castService: {
    play: jest.fn(),
    control: jest.fn(),
  },
}));

jest.mock("../PlaybackSessionPlaybackService", () => ({
  advanceCastSessionAfterFailure: jest.fn(),
  cancelPlaybackSession: jest.fn(),
  markPlaybackSessionCasting: jest.fn(),
}));

describe("PlaybackSessionCastService", () => {
  const play = castService.play as jest.MockedFunction<typeof castService.play>;
  const control = castService.control as jest.MockedFunction<
    typeof castService.control
  >;
  const advance = advanceCastSessionAfterFailure as jest.MockedFunction<
    typeof advanceCastSessionAfterFailure
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    play.mockResolvedValue(undefined);
    control.mockResolvedValue(undefined);
  });

  it("marks a prepared session as casting and sends HLS with the correct content type", async () => {
    const result = await startCastSession(
      { id: "living-room", name: "Living Room", type: "chromecast" },
      "Example Movie",
      {
        sessionId: "session-1",
        candidateId: "candidate-1",
        attemptId: "attempt-1",
        stream: { url: "https://cdn.example.test/master.m3u8" },
        uri: "https://cdn.example.test/master.m3u8",
      },
    );

    expect(markPlaybackSessionCasting).toHaveBeenCalledWith("session-1");
    expect(play).toHaveBeenCalledWith(
      "living-room",
      "https://cdn.example.test/master.m3u8",
      "Example Movie",
      "application/vnd.apple.mpegurl",
    );
    expect(result).toMatchObject({
      ok: true,
      sessionId: "session-1",
      candidateId: "candidate-1",
    });
  });

  it("automatically starts the next resolved candidate when the display rejects a source", async () => {
    const onFallback = jest.fn();
    play
      .mockRejectedValueOnce(new Error("Media load failed"))
      .mockResolvedValueOnce(undefined);
    advance.mockResolvedValueOnce({
      ok: true,
      sessionId: "session-1",
      candidateId: "candidate-2",
      attemptId: "attempt-2",
      stream: { url: "https://cdn.example.test/fallback.mp4" },
      uri: "https://cdn.example.test/fallback.mp4",
      fallbackReason: "Trying another source.",
    });

    const result = await startCastSession(
      { id: "living-room", name: "Living Room", type: "chromecast" },
      "Example Movie",
      {
        sessionId: "session-1",
        candidateId: "candidate-1",
        attemptId: "attempt-1",
        stream: { url: "https://cdn.example.test/primary.mp4" },
        uri: "https://cdn.example.test/primary.mp4",
      },
      { onFallback },
    );

    expect(advance).toHaveBeenCalledWith(
      "session-1",
      "candidate-1",
      "attempt-1",
      expect.objectContaining({
        code: "SOURCE_UNAVAILABLE",
        shouldFallback: true,
      }),
    );
    expect(play).toHaveBeenNthCalledWith(
      2,
      "living-room",
      "https://cdn.example.test/fallback.mp4",
      "Example Movie",
      "video/mp4",
    );
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      candidateId: "candidate-2",
    });
  });

  it("cancels the playback session even when stopping the display fails", async () => {
    control.mockRejectedValueOnce(new Error("Device unavailable"));

    await expect(stopCastSession("living-room", "session-1")).rejects.toThrow(
      "Device unavailable",
    );

    expect(cancelPlaybackSession).toHaveBeenCalledWith(
      "session-1",
      "User stopped casting.",
    );
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  formatMediaRuntimeError,
  getFfmpegBinaryPath,
  getFfprobeBinaryPath,
} from "../media-runtime.js";

const previousFfmpegPath = process.env.STREAMER_FFMPEG_PATH;
const previousFfprobePath = process.env.STREAMER_FFPROBE_PATH;

afterEach(() => {
  if (previousFfmpegPath === undefined) {
    delete process.env.STREAMER_FFMPEG_PATH;
  } else {
    process.env.STREAMER_FFMPEG_PATH = previousFfmpegPath;
  }
  if (previousFfprobePath === undefined) {
    delete process.env.STREAMER_FFPROBE_PATH;
  } else {
    process.env.STREAMER_FFPROBE_PATH = previousFfprobePath;
  }
});

describe("media runtime resolution", () => {
  it("derives ffprobe next to an explicitly configured ffmpeg binary", () => {
    process.env.STREAMER_FFMPEG_PATH = "/opt/streamer/bin/ffmpeg";
    delete process.env.STREAMER_FFPROBE_PATH;

    expect(getFfmpegBinaryPath()).toBe("/opt/streamer/bin/ffmpeg");
    expect(getFfprobeBinaryPath()).toBe("/opt/streamer/bin/ffprobe");
  });

  it("preserves an explicit ffprobe override", () => {
    process.env.STREAMER_FFMPEG_PATH = "/opt/streamer/bin/ffmpeg";
    process.env.STREAMER_FFPROBE_PATH = "/custom/ffprobe";

    expect(getFfprobeBinaryPath()).toBe("/custom/ffprobe");
  });

  it("turns the arm64 spawn failure into actionable, safe guidance", () => {
    const message = formatMediaRuntimeError({
      code: -86,
      message: "spawn Unknown system error -86",
    });

    expect(message).toContain("current runtime architecture");
    expect(message).toContain("FFmpeg/FFprobe");
    expect(message).not.toContain("-86");
  });
});

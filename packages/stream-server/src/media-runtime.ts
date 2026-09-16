import { existsSync } from "fs";
import path from "path";

function configuredPath(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function preferredArm64Binary(binaryName: "ffmpeg" | "ffprobe") {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    return undefined;
  }
  const candidate = `/opt/homebrew/bin/${binaryName}`;
  return existsSync(candidate) ? candidate : undefined;
}

function siblingProbePath(ffmpegPath: string) {
  const basename = path.basename(ffmpegPath);
  if (basename !== "ffmpeg" && basename !== "ffmpeg.exe") return undefined;
  return path.join(path.dirname(ffmpegPath), "ffprobe");
}

export function getFfmpegBinaryPath() {
  return (
    configuredPath("STREAMER_FFMPEG_PATH") ||
    preferredArm64Binary("ffmpeg") ||
    "ffmpeg"
  );
}

export function getFfprobeBinaryPath() {
  const explicit = configuredPath("STREAMER_FFPROBE_PATH");
  if (explicit) return explicit;

  const ffmpegPath = getFfmpegBinaryPath();
  return (
    siblingProbePath(ffmpegPath) || preferredArm64Binary("ffprobe") || "ffprobe"
  );
}

export function formatMediaRuntimeError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown } | undefined;
  const code = candidate?.code;
  const message = String(candidate?.message ?? error ?? "");
  const architectureMismatch =
    code === -86 ||
    /bad cpu type|incompatible architecture|wrong architecture|system error -86/i.test(
      message,
    );

  if (architectureMismatch) {
    return "FFmpeg/FFprobe is not compatible with the current runtime architecture. Install architecture-compatible FFmpeg/FFprobe binaries or set STREAMER_FFMPEG_PATH and STREAMER_FFPROBE_PATH.";
  }

  return "FFmpeg/FFprobe is unavailable to the playback runtime.";
}

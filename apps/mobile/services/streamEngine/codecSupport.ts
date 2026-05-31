import type { Stream } from "@streamer/shared";

const HEVC_PATTERN =
  /(?:\bhevc\b|\bh\.?265\b|\bx265\b|\bdv\b|\bdolby[ ._-]?vision\b)/i;

function streamLabel(stream: Stream | null | undefined) {
  if (!stream) return "";
  return [stream.title, stream.name, stream.resolution]
    .filter(Boolean)
    .join(" ");
}

export function isLikelyHevcStream(stream: Stream | null | undefined) {
  return HEVC_PATTERN.test(streamLabel(stream));
}

export function canCurrentBrowserPlayHevc() {
  if (typeof document === "undefined") return true;

  const video = document.createElement("video");
  return [
    'video/mp4; codecs="hvc1"',
    'video/mp4; codecs="hev1"',
    'video/mp4; codecs="hvc1.1.6.L93.B0"',
    'video/mp4; codecs="hev1.1.6.L93.B0"',
  ].some((codec) => video.canPlayType(codec).length > 0);
}

export function getUnsupportedWebCodecReason(
  stream: Stream | null | undefined,
  canPlayHevc = canCurrentBrowserPlayHevc,
) {
  if (typeof document === "undefined") return null;
  if (!isLikelyHevcStream(stream)) return null;
  if (canPlayHevc()) return null;

  return "This source looks like HEVC/H.265 or Dolby Vision, which this desktop/web player cannot decode reliably. Pick an H.264/x264 source or a lower-quality MP4 instead.";
}

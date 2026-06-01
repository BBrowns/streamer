import type {
  DeviceProfile,
  MediaCandidate,
  PlaybackAction,
  Stream,
} from "@streamer/shared";

const QUALITY_SCORE: Record<string, number> = {
  "2160p": 4,
  "1080p": 3,
  "720p": 2,
  "480p": 1,
  SD: 0,
};

function sourceText(stream: Stream): string {
  return [stream.title, stream.name, stream.url, stream.externalUrl]
    .filter(Boolean)
    .join(" ");
}

export function normalizeStream(stream: Stream, index: number): MediaCandidate {
  const text = sourceText(stream);
  const lower = text.toLowerCase();
  const url = stream.url?.toLowerCase() ?? "";
  const externalUrl = stream.externalUrl?.toLowerCase() ?? "";

  const kind: MediaCandidate["kind"] = stream.infoHash
    ? "torrent"
    : url.includes(".m3u8") || externalUrl.includes(".m3u8")
      ? "hls"
      : stream.url
        ? "direct"
        : stream.externalUrl
          ? "external"
          : "unknown";

  const quality =
    stream.resolution === "2160p" || /(?:2160p|\b4k\b)/i.test(text)
      ? "2160p"
      : stream.resolution === "1080p" || /1080p/i.test(text)
        ? "1080p"
        : stream.resolution === "720p" || /720p/i.test(text)
          ? "720p"
          : stream.resolution === "480p" || /480p/i.test(text)
            ? "480p"
            : "SD";

  const container =
    kind === "hls" || lower.includes(".m3u8")
      ? "hls"
      : lower.includes(".mp4") || lower.includes(" mp4")
        ? "mp4"
        : lower.includes(".mkv") || lower.includes(" mkv")
          ? "mkv"
          : "unknown";

  const videoCodec = /\b(?:av1|av01)\b/i.test(text)
    ? "av1"
    : /\b(?:h\.?265|hevc|x265)\b/i.test(text) ||
        /dolby\s*vision|\bdv\b/i.test(text)
      ? "h265"
      : /\b(?:h\.?264|x264|avc)\b/i.test(text)
        ? "h264"
        : "unknown";

  const audioCodec = /\b(?:e-?ac-?3|ddp|dd\+)\b/i.test(text)
    ? "eac3"
    : /\b(?:ac-?3|dd5\.?1)\b/i.test(text)
      ? "ac3"
      : /\baac\b/i.test(text)
        ? "aac"
        : "unknown";

  const hdr = /dolby\s*vision|\bdv\b/i.test(text)
    ? "dolby-vision"
    : /\bhdr(?:10)?\b/i.test(text)
      ? "hdr10"
      : "unknown";

  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(gb|mb)\b/i);
  const sizeBytes = sizeMatch
    ? Math.round(
        Number(sizeMatch[1]) *
          (sizeMatch[2].toLowerCase() === "gb" ? 1024 ** 3 : 1024 ** 2),
      )
    : undefined;

  return {
    id:
      stream.infoHash || stream.url || stream.externalUrl || `stream-${index}`,
    stream,
    kind,
    quality,
    container,
    videoCodec,
    audioCodec,
    hdr,
    seeders: stream.seeders,
    sizeBytes,
    riskFlags: [],
  };
}

function hasCompatibleVideo(
  candidate: MediaCandidate,
  deviceProfile: DeviceProfile,
) {
  if (candidate.hdr === "dolby-vision") {
    return deviceProfile.supports.dolbyVision;
  }

  if (candidate.videoCodec === "h265") return deviceProfile.supports.h265;
  if (candidate.videoCodec === "av1") return deviceProfile.supports.av1;
  return true;
}

function hasCompatibleAudio(
  candidate: MediaCandidate,
  deviceProfile: DeviceProfile,
) {
  if (candidate.audioCodec === "eac3") return deviceProfile.supports.eac3;
  if (candidate.audioCodec === "ac3") return deviceProfile.supports.ac3;
  return true;
}

function hasCompatibleContainer(
  candidate: MediaCandidate,
  deviceProfile: DeviceProfile,
) {
  if (candidate.container === "hls") return deviceProfile.supports.hls;
  if (candidate.container === "mkv") return deviceProfile.supports.mkv;
  if (candidate.container === "mp4") return deviceProfile.supports.mp4;
  return true;
}

export function candidateNeedsRemux(
  candidate: MediaCandidate,
  deviceProfile: DeviceProfile,
) {
  return (
    candidate.container === "mkv" &&
    !deviceProfile.supports.mkv &&
    deviceProfile.supports.mp4 &&
    hasCompatibleVideo(candidate, deviceProfile)
  );
}

export function candidateNeedsTranscode(
  candidate: MediaCandidate,
  deviceProfile: DeviceProfile,
) {
  return (
    !hasCompatibleVideo(candidate, deviceProfile) ||
    !hasCompatibleAudio(candidate, deviceProfile)
  );
}

export function qualityWithinProfile(
  candidate: MediaCandidate,
  deviceProfile: DeviceProfile,
) {
  return (
    QUALITY_SCORE[candidate.quality || "SD"] <=
    QUALITY_SCORE[deviceProfile.maxQuality]
  );
}

export function scoreCandidate(
  candidate: MediaCandidate,
  action: PlaybackAction,
  deviceProfile: DeviceProfile,
  bridgeAvailable: boolean,
): number {
  let score = 0;

  if (candidate.kind === "direct") score += 1000;
  if (candidate.kind === "hls") score += 900;
  if (candidate.kind === "torrent" && bridgeAvailable) score += 650;

  if (candidate.videoCodec === "h264") score += 160;
  if (candidate.videoCodec === "h265" && deviceProfile.supports.h265) {
    score += 80;
  }
  if (candidate.hdr === "dolby-vision" && !deviceProfile.supports.dolbyVision) {
    score -= 500;
  }

  if (candidate.container === "mp4") score += 120;
  if (candidate.container === "hls") score += 80;
  if (candidateNeedsRemux(candidate, deviceProfile)) score += 40;

  score += (QUALITY_SCORE[candidate.quality || "SD"] ?? 0) * 40;

  if (!qualityWithinProfile(candidate, deviceProfile)) score -= 250;

  if (typeof candidate.seeders === "number") {
    score += Math.min(candidate.seeders, 250) / 2;
    if (candidate.seeders < 3) score -= 120;
  }

  if (action === "download" && candidate.kind === "hls") score -= 600;
  if (action === "cast" && candidate.container === "mkv") score -= 250;

  return score;
}

export function isDirectlyPlayable(
  candidate: MediaCandidate,
  deviceProfile: DeviceProfile,
) {
  return (
    !candidateNeedsTranscode(candidate, deviceProfile) &&
    hasCompatibleContainer(candidate, deviceProfile)
  );
}

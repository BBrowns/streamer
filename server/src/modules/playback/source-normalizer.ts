import { randomUUID } from "node:crypto";
import type {
  AudioLanguage,
  DeviceProfile,
  MediaCandidate,
  PlaybackAction,
  PlaybackDeviceCompatibility,
  Stream,
} from "@streamer/shared";

const QUALITY_SCORE: Record<string, number> = {
  "2160p": 4,
  "1080p": 3,
  "720p": 2,
  "480p": 1,
  SD: 0,
};

interface CandidateScoringPreferences {
  preferredAudioLanguage?: string | null;
}

function sourceText(stream: Stream): string {
  return [stream.title, stream.name, stream.url, stream.externalUrl]
    .filter(Boolean)
    .join(" ");
}

export function normalizePreferredAudioLanguage(
  value?: string | null,
): AudioLanguage {
  const language = value?.trim().toLowerCase();
  if (!language) return "en";

  if (language.startsWith("en")) return "en";
  if (language.startsWith("nl") || language.startsWith("dut")) return "nl";
  if (language.startsWith("es") || language.startsWith("spa")) return "es";
  if (language.startsWith("de") || language.startsWith("ger")) return "de";
  if (language.startsWith("fr")) return "fr";
  if (language.startsWith("it")) return "it";
  if (language.startsWith("pt") || language.startsWith("por")) return "pt";
  if (language.startsWith("ru")) return "ru";
  if (language.startsWith("hi")) return "hi";

  return "en";
}

export function detectAudioLanguageFromText(text: string): AudioLanguage {
  const subtitleOnlyLabel =
    /\b(?:vost(?:fr|en|es)?|vose|subbed|subtitulado|subtitles?)\b/i.test(text);

  if (/\b(?:multi|multi[-\s]?audio|dual[-\s]?audio)\b/i.test(text)) {
    return "multi";
  }

  if (subtitleOnlyLabel) return "unknown";

  if (
    /(?:\b(?:audio\s*)?(?:latino|latin\s*american|castellano|spanish|espa(?:ñ|n)ol|spa|esp(?:[-\s]?lat)?)\b|🇲🇽|🇪🇸)/i.test(
      text,
    )
  ) {
    return "es";
  }
  if (/\b(?:english|eng|original\s*english)\b|🇬🇧|🇺🇸/i.test(text)) return "en";
  if (/\b(?:nederlands|dutch|vlaams|nl)\b|🇳🇱|🇧🇪/i.test(text)) return "nl";
  if (/\b(?:german|deutsch|ger)\b|🇩🇪/i.test(text)) return "de";
  if (/\b(?:french|fran(?:ç|c)ais|truefrench|fre)\b|🇫🇷/i.test(text)) {
    return "fr";
  }
  if (/\b(?:italian|italiano|ita)\b|🇮🇹/i.test(text)) return "it";
  if (/\b(?:portuguese|brazilian|pt[-\s]?br|dublado|por)\b|🇧🇷|🇵🇹/i.test(text)) {
    return "pt";
  }
  if (/\b(?:russian|rus)\b|🇷🇺/i.test(text)) return "ru";
  if (/\b(?:hindi|hin)\b|🇮🇳/i.test(text)) return "hi";

  return "unknown";
}

export function detectAudioLanguage(candidate: MediaCandidate): AudioLanguage {
  return detectAudioLanguageFromText(sourceText(candidate.stream));
}

function audioLanguageScore(
  candidate: MediaCandidate,
  preferences?: CandidateScoringPreferences,
) {
  const preferred = normalizePreferredAudioLanguage(
    preferences?.preferredAudioLanguage,
  );
  const detected = detectAudioLanguage(candidate);

  if (detected === "multi") return 90;
  if (detected === preferred) return 220;
  if (detected === "unknown") return preferred === "en" ? 0 : -40;
  if (detected === "en") return preferred === "en" ? 220 : -120;

  return -180;
}

export function normalizeStream(stream: Stream): MediaCandidate {
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
    id: randomUUID(),
    stream,
    kind,
    quality,
    container,
    videoCodec,
    audioCodec,
    audioLanguage: detectAudioLanguageFromText(text),
    hdr,
    seeders: stream.seeders,
    sizeBytes,
    riskFlags: [],
  };
}

export function hasCompatibleVideo(
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

export function hasCompatibleAudio(
  candidate: MediaCandidate,
  deviceProfile: DeviceProfile,
) {
  if (candidate.audioCodec === "eac3") return deviceProfile.supports.eac3;
  if (candidate.audioCodec === "ac3") return deviceProfile.supports.ac3;
  return true;
}

export function hasCompatibleContainer(
  candidate: MediaCandidate,
  deviceProfile: DeviceProfile,
) {
  if (candidate.container === "hls") return deviceProfile.supports.hls;
  if (candidate.container === "mkv") return deviceProfile.supports.mkv;
  if (candidate.container === "mp4") return deviceProfile.supports.mp4;
  return true;
}

export type CastSourceReachability = "reachable" | "localhost" | "unreachable";

export function getCastSourceReachability(
  candidate: MediaCandidate,
  bridgeUrl?: string,
): CastSourceReachability {
  const value =
    candidate.kind === "torrent"
      ? bridgeUrl
      : candidate.stream.url || candidate.stream.externalUrl;
  if (!value) return "unreachable";

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "unreachable";
    }

    const hostname = url.hostname.toLowerCase();
    const localhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0";
    return localhost ? "localhost" : "reachable";
  } catch {
    return "unreachable";
  }
}

export function isCandidateReachableForCast(
  candidate: MediaCandidate,
  bridgeUrl?: string,
) {
  return getCastSourceReachability(candidate, bridgeUrl) === "reachable";
}

export function getDeviceCompatibility(
  candidate: MediaCandidate,
  deviceProfile: DeviceProfile,
  sourceReachable = true,
): PlaybackDeviceCompatibility {
  const containerSupported = hasCompatibleContainer(candidate, deviceProfile);
  const videoCodecSupported = hasCompatibleVideo(candidate, deviceProfile);
  const audioCodecSupported = hasCompatibleAudio(candidate, deviceProfile);

  return {
    compatible:
      containerSupported &&
      videoCodecSupported &&
      audioCodecSupported &&
      sourceReachable,
    containerSupported,
    videoCodecSupported,
    audioCodecSupported,
    qualityWithinProfile: qualityWithinProfile(candidate, deviceProfile),
    sourceReachable,
  };
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
  preferences?: CandidateScoringPreferences,
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
  score += audioLanguageScore(candidate, preferences);

  if (!qualityWithinProfile(candidate, deviceProfile)) score -= 250;

  if (typeof candidate.seeders === "number") {
    score += Math.min(candidate.seeders, 250) / 2;
    if (candidate.seeders < 3) score -= 120;
  }

  if (action === "download" && candidate.kind === "hls") score -= 600;
  if (action === "download" && candidate.kind === "direct") score += 200;
  if (action === "cast" && candidate.kind === "hls") score += 180;
  if (action === "cast" && candidate.container === "mp4") score += 120;
  if (action === "cast" && candidate.container === "mkv") score -= 250;

  return score;
}

export function candidateSortKey(candidate: MediaCandidate) {
  return [
    candidate.kind,
    candidate.quality,
    candidate.container,
    candidate.videoCodec,
    candidate.audioCodec,
    candidate.stream.title,
    candidate.stream.name,
    candidate.stream.infoHash,
    candidate.stream.fileIdx,
    candidate.stream.url,
    candidate.stream.externalUrl,
  ]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join("|")
    .toLowerCase();
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

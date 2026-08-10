import type {
  AudioTrack as ExpoAudioTrack,
  SubtitleTrack as ExpoSubtitleTrack,
} from "expo-video";
import type { NormalizedMediaTrack } from "@streamer/shared";
import type { AudioTrack, SubtitleTrack } from "../streamEngine/IStreamEngine";
import type {
  MediaPlayerCapabilities,
  NormalizedMediaTrack as MediaAdapterTrack,
} from "./MediaPlayerAdapter";

type ExpoTrack = ExpoAudioTrack | ExpoSubtitleTrack;
type TrackRow = AudioTrack | SubtitleTrack;
type TrackKind = "audio" | "subtitle";

function trackId(track: ExpoTrack, index: number) {
  return track.id || `${track.language || "unknown"}:${track.label || index}`;
}

export function normalizeTrackLanguage(value?: string | null) {
  const language = value?.trim().toLowerCase();
  if (!language) return "unknown";

  const primary = language.split(/[-_]/)[0];
  if (primary === "en" || primary === "eng") return "en";
  if (primary === "nl" || primary === "nld" || primary === "dut") return "nl";
  if (primary === "es" || primary === "spa" || primary === "esp") return "es";
  if (primary === "de" || primary === "deu" || primary === "ger") return "de";
  if (primary === "fr" || primary === "fra" || primary === "fre") return "fr";
  if (primary === "it" || primary === "ita") return "it";
  if (primary === "pt" || primary === "por") return "pt";
  if (primary === "ru" || primary === "rus") return "ru";
  if (primary === "hi" || primary === "hin") return "hi";

  return primary || "unknown";
}

export function formatMediaTrackLabel(label: string, kind?: TrackKind) {
  if (
    kind === "audio" &&
    /\b(ad|descriptive audio|audio desc(?:ription)?)\b/i.test(label) &&
    !/audio description/i.test(label)
  ) {
    return `${label} (Audio description)`;
  }

  if (
    kind === "subtitle" &&
    /\b(sdh|cc|closed captions?|hearing impaired)\b/i.test(label) &&
    !/(deaf|hard of hearing|closed captions?)/i.test(label)
  ) {
    return `${label} (Captions for deaf and hard of hearing)`;
  }

  return label;
}

export function buildTrackRows<T extends ExpoAudioTrack>(
  tracks: T[],
  activeTrack: T | null | undefined,
  kind: "audio",
): AudioTrack[];
export function buildTrackRows<T extends ExpoSubtitleTrack>(
  tracks: T[],
  activeTrack: T | null | undefined,
  kind: "subtitle",
): SubtitleTrack[];
export function buildTrackRows<T extends ExpoTrack>(
  tracks: T[],
  activeTrack?: T | null,
  kind?: TrackKind,
): TrackRow[];
export function buildTrackRows<T extends ExpoTrack>(
  tracks: T[],
  activeTrack?: T | null,
  kind?: TrackKind,
): TrackRow[] {
  const activeLanguage = normalizeTrackLanguage(activeTrack?.language);
  const activeLabel = activeTrack?.label || activeTrack?.name;
  const activeId = activeTrack ? trackId(activeTrack, -1) : null;

  return tracks.map((track, index) => {
    const id = trackId(track, index);
    const language = normalizeTrackLanguage(track.language);
    const rawLabel =
      track.label ||
      track.name ||
      (language === "unknown" ? "Unknown" : language.toUpperCase());
    const label = formatMediaTrackLabel(rawLabel, kind);

    return {
      id,
      label,
      language,
      active:
        Boolean(activeTrack) &&
        (id === activeId ||
          (language === activeLanguage &&
            Boolean(activeLabel) &&
            activeLabel === (track.label || track.name))),
    };
  });
}

export function mergeSubtitleTracks(tracks: SubtitleTrack[]): SubtitleTrack[] {
  const bestByIdentity = new Map<string, SubtitleTrack>();
  const sourceOrder = { embedded: 0, "torrent-file": 1, addon: 2 } as const;

  for (const track of tracks) {
    const key = [
      track.language.toLowerCase(),
      track.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim(),
      track.forced ? "forced" : "normal",
      track.hearingImpaired ? "sdh" : "standard",
    ].join(":");
    const existing = bestByIdentity.get(key);
    const trackScore =
      (track.confidence ?? 0.5) +
      (track.contentIdMatch ? 0.1 : 0) -
      sourceOrder[track.source ?? "addon"] * 0.001;
    const existingScore = existing
      ? (existing.confidence ?? 0.5) +
        (existing.contentIdMatch ? 0.1 : 0) -
        sourceOrder[existing.source ?? "addon"] * 0.001
      : -1;
    if (
      !existing ||
      trackScore > existingScore ||
      (trackScore === existingScore && track.id.localeCompare(existing.id) < 0)
    ) {
      bestByIdentity.set(key, track);
    }
  }

  return [...bestByIdentity.values()].sort(
    (left, right) =>
      left.language.localeCompare(right.language) ||
      Number(Boolean(right.forced)) - Number(Boolean(left.forced)) ||
      left.label.localeCompare(right.label) ||
      left.id.localeCompare(right.id),
  );
}

export function buildPlayerTrackCatalog({
  availableAudioTracks,
  activeAudioTrack,
  availableSubtitleTracks,
  activeSubtitleTrack,
  engineSubtitles,
}: {
  availableAudioTracks: ExpoAudioTrack[];
  activeAudioTrack?: ExpoAudioTrack | null;
  availableSubtitleTracks: ExpoSubtitleTrack[];
  activeSubtitleTrack?: ExpoSubtitleTrack | null;
  engineSubtitles: SubtitleTrack[];
}) {
  const nativeSubtitles = buildTrackRows(
    availableSubtitleTracks,
    activeSubtitleTrack,
    "subtitle",
  ).map(
    (track): SubtitleTrack => ({
      ...track,
      source: "embedded",
      confidence: 1,
    }),
  );

  return {
    // Gateway audio descriptors are discovery metadata. Only tracks exposed by
    // the active native player are selectable without replacing the source.
    audioTracks: buildTrackRows(
      availableAudioTracks,
      activeAudioTrack,
      "audio",
    ),
    subtitles: mergeSubtitleTracks([...nativeSubtitles, ...engineSubtitles]),
  };
}

export function buildMediaAdapterTrackCatalog({
  capabilities,
  mediaAudioTracks,
  mediaSubtitleTracks,
  engineSubtitles,
}: {
  capabilities: Pick<
    MediaPlayerCapabilities,
    "audioTracks" | "embeddedSubtitles"
  >;
  mediaAudioTracks: MediaAdapterTrack[];
  mediaSubtitleTracks: MediaAdapterTrack[];
  engineSubtitles: SubtitleTrack[];
}) {
  const audioTracks: AudioTrack[] = capabilities.audioTracks
    ? mediaAudioTracks
        .filter((track) => track.kind === "audio")
        .map((track) => ({
          id: track.id,
          label: formatMediaTrackLabel(track.label, "audio"),
          language: normalizeTrackLanguage(track.language),
          active: track.active,
        }))
    : [];
  const embeddedSubtitles: SubtitleTrack[] = capabilities.embeddedSubtitles
    ? mediaSubtitleTracks
        .filter((track) => track.kind === "subtitle")
        .map((track) => ({
          id: track.id,
          label: formatMediaTrackLabel(track.label, "subtitle"),
          language: normalizeTrackLanguage(track.language),
          active: track.active,
          source: "embedded",
          confidence: 1,
        }))
    : [];

  return {
    audioTracks,
    subtitles: mergeSubtitleTracks([...embeddedSubtitles, ...engineSubtitles]),
  };
}

export function findPreferredPlayerTrack<T extends ExpoTrack>(
  tracks: T[],
  preferredLanguage?: string | null,
): T | null {
  if (tracks.length === 0 || !preferredLanguage) return null;

  const preferred = normalizeTrackLanguage(preferredLanguage);
  const matching = tracks.find(
    (track) => normalizeTrackLanguage(track.language) === preferred,
  );
  if (matching) return matching;

  return tracks.find((track) => track.isDefault || track.autoSelect) || null;
}

export function findPlayerTrackByRowId<T extends ExpoTrack>(
  tracks: T[],
  id: string,
): T | null {
  return tracks.find((track, index) => trackId(track, index) === id) || null;
}

export interface AudioTrackRankingContext {
  explicitTrackId?: string | null;
  preferredLanguages: string[];
  originalLanguage?: string | null;
  preferOriginalLanguage: boolean;
  preferAudioDescription: boolean;
  supportedCodecs?: string[];
}

export function rankAudioTracks(
  tracks: NormalizedMediaTrack[],
  context: AudioTrackRankingContext,
) {
  const preferredLanguages = context.preferredLanguages.map(
    normalizeTrackLanguage,
  );
  const originalLanguage = normalizeTrackLanguage(context.originalLanguage);

  return tracks
    .filter((track) => track.kind === "audio")
    .map((track) => {
      let score = 0;
      const reasons: string[] = [];
      const language = normalizeTrackLanguage(track.language);
      const languageIndex = preferredLanguages.indexOf(language);

      if (track.id === context.explicitTrackId) {
        score += 10_000;
        reasons.push("explicit");
      }
      if (languageIndex >= 0) {
        score += 500 - languageIndex * 20;
        reasons.push("preferred_language");
      }
      if (
        context.preferOriginalLanguage &&
        originalLanguage !== "unknown" &&
        language === originalLanguage
      ) {
        score += 450;
        reasons.push("original_language");
      }
      if (track.default) {
        score += 80;
        reasons.push("default");
      }
      if (track.commentary) score -= 400;
      if (track.audioDescription) {
        score += context.preferAudioDescription ? 500 : -120;
        if (context.preferAudioDescription) reasons.push("audio_description");
      }
      if (!track.supported) score -= 2_000;
      if (
        context.supportedCodecs &&
        !context.supportedCodecs.includes(track.codec.toLowerCase())
      ) {
        score -= 1_000;
      }
      if (track.channelCount && track.channelCount > 2) {
        score += Math.min(track.channelCount, 8);
      }

      return { track, score, reasons };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.track.id.localeCompare(right.track.id),
    );
}

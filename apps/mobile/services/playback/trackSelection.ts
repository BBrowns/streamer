import type {
  AudioTrack as ExpoAudioTrack,
  SubtitleTrack as ExpoSubtitleTrack,
} from "expo-video";
import type { AudioTrack, SubtitleTrack } from "../streamEngine/IStreamEngine";

type ExpoTrack = ExpoAudioTrack | ExpoSubtitleTrack;
type TrackRow = AudioTrack | SubtitleTrack;

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

export function buildTrackRows<T extends ExpoTrack>(
  tracks: T[],
  activeTrack?: T | null,
): TrackRow[] {
  const activeLanguage = normalizeTrackLanguage(activeTrack?.language);
  const activeLabel = activeTrack?.label || activeTrack?.name;
  const activeId = activeTrack ? trackId(activeTrack, -1) : null;

  return tracks.map((track, index) => {
    const id = trackId(track, index);
    const language = normalizeTrackLanguage(track.language);
    const label =
      track.label ||
      track.name ||
      (language === "unknown" ? "Unknown" : language.toUpperCase());

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

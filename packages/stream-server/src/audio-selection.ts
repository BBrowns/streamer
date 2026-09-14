import { normalizeMediaLanguage } from "./media-probe.js";

type AudioTrack = {
  id: string;
  kind: string;
  language: string;
  title?: string;
  default: boolean;
  audioDescription: boolean;
  commentary: boolean;
  supported: boolean;
};

export class GatewayTracksUnavailableError extends Error {
  readonly code = "TRACKS_UNAVAILABLE" as const;
  constructor() {
    super("The preferred audio track is unavailable for this source.");
    this.name = "GatewayTracksUnavailableError";
  }
}

export function selectPreferredAudioTrack(
  tracks: AudioTrack[],
  language: string | null = "en",
) {
  language = language === null ? null : normalizeMediaLanguage(language);
  const main = tracks.filter(
    (track) =>
      track.kind === "audio" &&
      track.supported &&
      !track.audioDescription &&
      !track.commentary,
  );
  const matches =
    language === null
      ? main
      : main.filter((track) => {
          const metadataLanguage = track.language.toLowerCase();
          if (metadataLanguage === language) return true;
          // A title cannot overrule a known, conflicting language tag.
          if (
            language !== "en" ||
            !["unknown", "und", ""].includes(metadataLanguage) ||
            !track.title
          )
            return false;
          const title = track.title
            .toLowerCase()
            .replace(/[()[\],:_-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return /^english(?:\s+(?:original|default|stereo|mono|aac|ac3|dts|atmos|\d(?:\.\d)?))*$/i.test(
            title,
          );
        });
  return (matches.find((track) => track.default) ?? matches[0])?.id;
}

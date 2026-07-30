import { addonSubtitleCatalogSchema } from "@streamer/shared";
import type { MediaInfo } from "../../stores/playerStore";
import type { SubtitleTrack } from "../streamEngine/IStreamEngine";
import { api } from "../api";
export { mergeSubtitleTracks } from "./trackSelection";

const MAX_SUBTITLE_DOCUMENT_CHARACTERS = 8 * 1024 * 1024;

function contentIdForMedia(media: MediaInfo) {
  if (
    media.type === "series" &&
    Number.isInteger(media.season) &&
    Number.isInteger(media.episode)
  ) {
    return `${media.itemId}:${media.season}:${media.episode}`;
  }
  return media.itemId;
}

export async function getAddonSubtitles(
  media: MediaInfo,
  signal?: AbortSignal,
): Promise<SubtitleTrack[]> {
  const contentId = contentIdForMedia(media);
  const { data } = await api.get(
    `/api/aggregator/subtitles/${encodeURIComponent(
      media.type,
    )}/${encodeURIComponent(contentId)}`,
    { signal },
  );
  const catalog = addonSubtitleCatalogSchema.parse(data);
  return catalog.subtitles.map((subtitle) => ({
    id: subtitle.id,
    label: subtitle.label,
    language: subtitle.language,
    active: false,
    format: subtitle.format,
    source: "addon",
    forced: subtitle.forced,
    hearingImpaired: subtitle.hearingImpaired,
    fetchIdentity: subtitle.fetchIdentity,
    providerName: subtitle.providerName,
    confidence: subtitle.confidence,
    contentIdMatch: subtitle.contentIdMatch,
  }));
}

export async function loadAddonSubtitleDocument(
  track: SubtitleTrack,
  signal?: AbortSignal,
) {
  if (track.source !== "addon" || !track.fetchIdentity) {
    throw new Error("Add-on subtitle identity is unavailable");
  }
  const { data } = await api.get(
    `/api/aggregator/subtitles/document/${encodeURIComponent(
      track.fetchIdentity,
    )}`,
    {
      signal,
      responseType: "text",
      transformResponse: [(value) => value],
    },
  );
  const document = typeof data === "string" ? data : String(data ?? "");
  if (document.length > MAX_SUBTITLE_DOCUMENT_CHARACTERS) {
    throw new Error("Subtitle document exceeded its size limit");
  }
  return document;
}

export type MediaTrackKind = "audio" | "subtitle";
export type MediaTrackSource = "native" | "embedded" | "torrent-file" | "addon";

export interface NormalizedMediaTrack {
  id: string;
  streamIndex: number;
  kind: MediaTrackKind;
  language: string;
  title?: string;
  codec: string;
  channelCount?: number;
  channelLayout?: string;
  default: boolean;
  forced: boolean;
  hearingImpaired: boolean;
  audioDescription: boolean;
  commentary: boolean;
  source: MediaTrackSource;
  supported: boolean;
  unsupportedReason?: "bitmap_subtitle" | "codec" | "platform";
}

export type SubtitleCandidateFormat =
  | "srt"
  | "vtt"
  | "ass"
  | "ssa"
  | "cue-json"
  | "unknown";

/**
 * Runtime-only subtitle descriptor. `fetchIdentity` is opaque to clients and
 * must never be copied into PlaybackSession persistence.
 */
export interface SubtitleCandidate {
  id: string;
  providerId?: string;
  providerName?: string;
  language: string;
  format: SubtitleCandidateFormat;
  source: Extract<MediaTrackSource, "embedded" | "torrent-file" | "addon">;
  label: string;
  releaseName?: string;
  hearingImpaired: boolean;
  forced: boolean;
  fps?: number;
  fileHashMatch: boolean;
  fileNameMatch: boolean;
  contentIdMatch: boolean;
  confidence: number;
  active: boolean;
  fetchIdentity?: string;
}

export interface GatewayTrackCatalog {
  jobId: string;
  selectedFileIndex: number;
  tracks: NormalizedMediaTrack[];
  subtitles: SubtitleCandidate[];
}

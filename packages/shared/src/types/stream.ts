/** A single stream link returned by an add-on */
export interface Stream {
  url?: string;
  ytId?: string;
  infoHash?: string;
  fileIdx?: number;
  fileSelectionHints?: {
    season?: number;
    episode?: number;
    title?: string;
  };
  externalUrl?: string;
  title?: string;
  name?: string;
  type?: string;
  id?: string;
  resolution?: string;
  seeders?: number;
  behaviorHints?: {
    notWebReady?: boolean;
    bingeGroup?: string;
    remuxToMp4?: boolean;
    /**
     * Runtime-only delivery choice made by the playback control plane. It is
     * never persisted with a session or treated as add-on metadata.
     */
    remuxStrategy?: "progressive-fmp4" | "seekable-cache";
  };
}

/** Stream response from an add-on */
export interface StreamResponse {
  streams: Stream[];
}

/** Engine types supported by the player */
export type StreamEngineType = "hls" | "torrent";

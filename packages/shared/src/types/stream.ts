/** A single stream link returned by an add-on */
export interface Stream {
  url?: string;
  ytId?: string;
  infoHash?: string;
  fileIdx?: number;
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
  };
}

/** Stream response from an add-on */
export interface StreamResponse {
  streams: Stream[];
}

/** Engine types supported by the player */
export type StreamEngineType = "hls" | "torrent";

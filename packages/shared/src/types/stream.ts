/** A single stream link returned by an add-on */
export interface Stream {
    url: string;
    title?: string;
    name?: string;
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
export type StreamEngineType = 'hls' | 'torrent';

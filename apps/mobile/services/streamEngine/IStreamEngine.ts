import type { Stream } from '@streamer/shared';

/**
 * Strategy Pattern interface for stream engines.
 * The MVP only implements HLSEngine.
 * A TorrentEngine can be added later without modifying existing code.
 */
export interface IStreamEngine {
    /** Check if this engine can handle the given stream */
    canPlay(stream: Stream): boolean;

    /** Get the playback URI for the stream */
    getPlaybackUri(stream: Stream): string;

    /** Get the engine type identifier */
    getEngineType(): string;
}

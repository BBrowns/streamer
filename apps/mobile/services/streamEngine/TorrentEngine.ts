import type { Stream } from '@streamer/shared';
import type { AudioTrack, IStreamEngine, SubtitleTrack } from './IStreamEngine';

export class TorrentEngine implements IStreamEngine {
    private listeners = new Map<string, Set<Function>>();

    canPlay(stream: Stream): boolean {
        // Only claim we can play it if it's an infohash torrent 
        // We do this so the UI shows "Engine: torrent" instead of "unknown"
        return !!stream.infoHash;
    }

    getPlaybackUri(stream: Stream): string {
        // Return empty string to trigger the Unsupported Alert in the UI
        return '';
    }

    getEngineType(): string {
        return 'torrent';
    }

    // Pass-through track stubs
    getAudioTracks(): AudioTrack[] { return []; }
    setAudioTrack(id: string): void { }
    getSubtitles(): SubtitleTrack[] { return []; }
    setSubtitle(id: string | null): void { }

    on(event: string, callback: Function): void { }
    off(event: string, callback: Function): void { }
    destroy(): void { }
}

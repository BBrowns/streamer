import type { Stream } from '@streamer/shared';
import type { IStreamEngine } from './IStreamEngine';

/**
 * HLS/HTTP stream engine.
 * Handles .m3u8 playlists and direct HTTP video URLs.
 */
export class HLSEngine implements IStreamEngine {
    canPlay(stream: Stream): boolean {
        const url = stream.url.toLowerCase();
        // Supports HLS manifests and direct HTTP/HTTPS video URLs
        return (
            url.includes('.m3u8') ||
            url.startsWith('http://') ||
            url.startsWith('https://')
        );
    }

    getPlaybackUri(stream: Stream): string {
        return stream.url;
    }

    getEngineType(): string {
        return 'hls';
    }
}

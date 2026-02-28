import type { Stream } from '@streamer/shared';
import type { AudioTrack, IStreamEngine, SubtitleTrack, StreamStats } from './IStreamEngine';

interface BridgeConfig {
    activeStrategy: string;
    bridgeAvailable: boolean;
    bridgeUrl: string;
}

export class TorrentEngine implements IStreamEngine {
    private listeners = new Map<string, Set<Function>>();
    private statsInterval: ReturnType<typeof setInterval> | null = null;
    private bridge: BridgeConfig;

    constructor(bridge: BridgeConfig) {
        this.bridge = bridge;
    }

    canPlay(stream: Stream): boolean {
        // Only claim we can play it if it's an infohash torrent 
        return !!stream.infoHash;
    }

    getPlaybackUri(stream: Stream): string {
        if (this.bridge.activeStrategy === 'local' && this.bridge.bridgeAvailable) {
            // Build the magnet link or infohash to send to the bridge
            const magnet = `magnet:?xt=urn:btih:${stream.infoHash}`;
            this.startStatsPolling();
            return `${this.bridge.bridgeUrl}/stream?magnet=${encodeURIComponent(magnet)}`;
        }

        // Debrid strategy would be handled differently (e.g. creating the direct link before passing to HttpVideoEngine)
        // If no bridge, return empty string to trigger Unsupported Alert
        return '';
    }

    private startStatsPolling() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
        }

        this.statsInterval = setInterval(async () => {
            if (!this.bridge.bridgeAvailable) return;
            try {
                const res = await fetch(`${this.bridge.bridgeUrl}/stats`);
                if (res.ok) {
                    const stats: StreamStats = await res.json();
                    this.emit('stats', stats);
                }
            } catch (e) {
                console.warn('Failed to fetch torrent stats from bridge', e);
            }
        }, 2000); // poll every 2 seconds
    }

    private emit(event: string, data: any) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach((cb) => cb(data));
        }
    }

    getEngineType(): string {
        return 'torrent';
    }

    // Pass-through track stubs
    getAudioTracks(): AudioTrack[] { return []; }
    setAudioTrack(id: string): void { }
    getSubtitles(): SubtitleTrack[] { return []; }
    setSubtitle(id: string | null): void { }

    on(event: string, callback: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
    }

    off(event: string, callback: Function): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.delete(callback);
        }
    }

    stop(): void {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        this.listeners.clear();
    }
}

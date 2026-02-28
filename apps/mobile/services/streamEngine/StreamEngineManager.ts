import type { Stream } from '@streamer/shared';
import type { IStreamEngine } from './IStreamEngine';
import { HLSEngine } from './HLSEngine';
import { HttpVideoEngine } from './HttpVideoEngine';
import { TorrentEngine } from './TorrentEngine';

export type StreamingStrategy = 'debrid' | 'local';

export class StreamEngineManager {
    private engines: IStreamEngine[] = [];
    public activeStrategy: StreamingStrategy = 'debrid';
    public bridgeUrl: string = 'http://127.0.0.1:11470';
    public bridgeAvailable: boolean = false;

    constructor() {
        this.registerEngine(new HLSEngine());
        this.registerEngine(new HttpVideoEngine());
        this.registerEngine(new TorrentEngine(this));

        // Probe for bridge
        this.detectBridge();
    }

    async detectBridge() {
        try {
            const res = await fetch(`${this.bridgeUrl}/status`);
            if (res.ok) {
                this.bridgeAvailable = true;
                this.activeStrategy = 'local';
            }
        } catch (e) {
            this.bridgeAvailable = false;
        }
    }

    registerEngine(engine: IStreamEngine): void {
        this.engines.push(engine);
    }

    resolveEngine(stream: Stream): IStreamEngine | null {
        return this.engines.find((e) => e.canPlay(stream)) ?? null;
    }

    getPlaybackUri(stream: Stream): string | null {
        const engine = this.resolveEngine(stream);
        return engine ? engine.getPlaybackUri(stream) : null;
    }
}

// Singleton instance
export const streamEngineManager = new StreamEngineManager();

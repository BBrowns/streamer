import type { Stream } from '@streamer/shared';
import type { IStreamEngine } from './IStreamEngine';
import { HLSEngine } from './HLSEngine';

/**
 * Manages stream engine resolution using the Strategy Pattern.
 * Engines are registered in priority order; the first engine that
 * can handle a stream is selected.
 */
export class StreamEngineManager {
    private engines: IStreamEngine[] = [];

    constructor() {
        // Register the HLS engine by default (MVP)
        this.registerEngine(new HLSEngine());
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

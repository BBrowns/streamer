import { HLSEngine } from '../HLSEngine';
import type { Stream } from '@streamer/shared';

describe('HLSEngine', () => {
    let engine: HLSEngine;

    beforeEach(() => {
        engine = new HLSEngine();
    });

    describe('canPlay', () => {
        it('should return true for HLS streams (.m3u8)', () => {
            const stream: Stream = { url: 'https://example.com/video.m3u8' };
            expect(engine.canPlay(stream)).toBe(true);
        });

        it('should return true for direct HTTP URLs', () => {
            const stream: Stream = { url: 'http://example.com/video.mp4' };
            expect(engine.canPlay(stream)).toBe(true);
        });

        it('should return true for direct HTTPS URLs', () => {
            const stream: Stream = { url: 'https://example.com/video.mkv' };
            expect(engine.canPlay(stream)).toBe(true);
        });

        it('should return false for deep link URIs like stremio://', () => {
            const stream: Stream = { url: 'stremio://example.com/video' };
            expect(engine.canPlay(stream)).toBe(false);
        });
    });

    describe('getPlaybackUri', () => {
        it('should return the url unchanged', () => {
            const stream: Stream = { url: 'https://example.com/video.m3u8' };
            expect(engine.getPlaybackUri(stream)).toBe('https://example.com/video.m3u8');
        });
    });

    describe('getEngineType', () => {
        it('should return "hls"', () => {
            expect(engine.getEngineType()).toBe('hls');
        });
    });
});

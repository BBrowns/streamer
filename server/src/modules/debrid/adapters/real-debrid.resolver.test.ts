import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealDebridResolver } from './real-debrid.resolver';

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('RealDebridResolver', () => {
    let resolver: RealDebridResolver;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        process.env.RD_API_TOKEN = 'test-token';
        resolver = new RealDebridResolver();
    });

    it('should return false for canResolve if token is missing', () => {
        delete process.env.RD_API_TOKEN;
        const noTokenResolver = new RealDebridResolver();
        expect(noTokenResolver.canResolve({ infoHash: 'abc' } as any)).toBe(false);
    });

    it('should return true for canResolve if token and infoHash are present', () => {
        expect(resolver.canResolve({ infoHash: 'abc' } as any)).toBe(true);
    });

    it('should resolve a cached torrent successfully', async () => {
        // 1. POST /torrents/addMagnet
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ id: 'torrent-123' }),
        });

        // 2. GET /torrents/info/torrent-123 (already downloaded)
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                id: 'torrent-123',
                status: 'downloaded',
                links: ['https://rd-hoster.com/link1'],
            }),
        });

        // 3. POST /unrestrict/link
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                download: 'https://direct-download.com/video.mp4',
                host: 'rd-hoster.com',
                filesize: 1000000,
            }),
        });

        const result = await resolver.resolve({ infoHash: 'hash123', title: 'Test' } as any, 'req-1');

        expect(result).toEqual({
            url: 'https://direct-download.com/video.mp4',
            host: 'rd-hoster.com',
            size: 1000000,
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should handle file selection for a pending torrent', async () => {
        // 1. POST /torrents/addMagnet
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ id: 'torrent-123' }),
        });

        // 2. GET /torrents/info/torrent-123 (waiting selection)
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                id: 'torrent-123',
                status: 'waiting_files_selection',
                files: [
                    { id: 1, path: 'movie.mp4', bytes: 1000 },
                    { id: 2, path: 'sample.mp4', bytes: 100 },
                ],
            }),
        });

        // 3. POST /torrents/selectFiles/torrent-123
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 204,
            json: () => Promise.resolve({}),
        });

        // 4. GET /torrents/info/torrent-123 (after selection, downloaded)
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                id: 'torrent-123',
                status: 'downloaded',
                links: ['https://rd-hoster.com/link1'],
            }),
        });

        // 5. POST /unrestrict/link
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                download: 'https://direct-download.com/video.mp4',
            }),
        });

        const result = await resolver.resolve({ infoHash: 'hash123' } as any, 'req-1');

        expect(result?.url).toBe('https://direct-download.com/video.mp4');
        // Check that we selected the largest file (id 1)
        const selectCall = fetchMock.mock.calls.find(call => call[1].method === 'POST' && call[0].includes('selectFiles'));
        expect(selectCall?.[1].body.get('files')).toBe('1');
    });

    it('should return null and delete if torrent fails to cache after polling', async () => {
        // 1. POST /torrents/addMagnet
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ id: 'torrent-123' }),
        });

        // 2. GET /torrents/info (loop 5 times)
        for (let i = 0; i < 6; i++) {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: 'torrent-123', status: 'downloading' }),
            });
        }

        // DELETE cleanup
        fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

        const resolvePromise = resolver.resolve({ infoHash: 'hash123' } as any, 'req-1');

        // Advance timers to trigger the polls
        for (let i = 0; i < 6; i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }

        const result = await resolvePromise;

        expect(result).toBeNull();
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/torrents/delete/torrent-123'), expect.objectContaining({ method: 'DELETE' }));

        vi.useRealTimers();
    });
});

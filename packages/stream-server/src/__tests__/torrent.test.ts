/**
 * Unit tests for the torrent stream-server handler.
 *
 * Strategy: import `handleTorrent` and `waitForReady` directly (they are now
 * exported). We avoid mocking the WebTorrent client at module level to
 * prevent ESM singleton state from causing vitest to hang.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Request, Response } from 'express';
import { handleTorrent, waitForReady } from '../torrent.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFakeStream() {
    const s = new EventEmitter() as any;
    s.pipe = vi.fn().mockReturnThis();
    s.destroy = vi.fn();
    return s;
}

function makeFakeFile(name = 'movie.mp4', size = 1_000_000) {
    const stream = makeFakeStream();
    return {
        name,
        length: size,
        createReadStream: vi.fn().mockReturnValue(stream),
    };
}

function makeReqRes(
    headers: Record<string, string> = {},
    query: Record<string, string> = {},
) {
    const req = {
        query,
        headers,
        on: vi.fn(),
    } as unknown as Request;

    const res = {
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        writeHead: vi.fn(),
        json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    return { req, res };
}

function makeTorrent(files: any[] = []) {
    const t = new EventEmitter() as any;
    t.files = files;
    return t;
}

// ─── handleTorrent ────────────────────────────────────────────────────────────

describe('handleTorrent', () => {
    it('sends 200 with correct Content-Type and streams full file', () => {
        const file = makeFakeFile('video.mp4', 2_000_000);
        const torrent = makeTorrent([file]);
        const { req, res } = makeReqRes();

        handleTorrent(torrent, req, res);

        expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
            'Content-Type': 'video/mp4',
            'Content-Length': 2_000_000,
            'Accept-Ranges': 'bytes',
        }));
        expect(file.createReadStream).toHaveBeenCalledWith();
    });

    it('sends 206 Partial Content for a range request', () => {
        const file = makeFakeFile('film.mkv', 5_000_000);
        const torrent = makeTorrent([file]);
        const { req, res } = makeReqRes({ range: 'bytes=0-1023' });

        handleTorrent(torrent, req, res);

        expect(res.writeHead).toHaveBeenCalledWith(206, expect.objectContaining({
            'Content-Type': 'video/x-matroska',
            'Content-Range': 'bytes 0-1023/5000000',
            'Content-Length': 1024,
        }));
        expect(file.createReadStream).toHaveBeenCalledWith({ start: 0, end: 1023 });
    });

    it('picks the largest file from a multi-file torrent', () => {
        const small = makeFakeFile('subtitle.srt', 10_000);
        const big = makeFakeFile('movie.mp4', 4_000_000_000);
        const torrent = makeTorrent([small, big]);
        const { req, res } = makeReqRes();

        handleTorrent(torrent, req, res);

        expect(big.createReadStream).toHaveBeenCalled();
        expect(small.createReadStream).not.toHaveBeenCalled();
    });

    it('destroys stream on client disconnect', () => {
        const file = makeFakeFile('video.webm', 1_000);
        const torrent = makeTorrent([file]);
        const { req, res } = makeReqRes();
        const fakeStream = makeFakeStream();
        file.createReadStream.mockReturnValue(fakeStream);

        handleTorrent(torrent, req, res);

        // Simulate client closing connection
        const closeHandler = (req.on as any).mock.calls.find(
            ([event]: [string]) => event === 'close',
        )[1];
        closeHandler();

        expect(fakeStream.destroy).toHaveBeenCalled();
    });

    it('correctly maps common video MIME types via file extension', () => {
        const cases: [string, string][] = [
            ['movie.mp4', 'video/mp4'],
            ['movie.mkv', 'video/x-matroska'],
            ['movie.webm', 'video/webm'],
            ['movie.avi', 'video/x-msvideo'],
            ['movie.mov', 'video/quicktime'],
            ['movie.unknown', 'video/mp4'], // default fallback
        ];

        for (const [filename, expectedMime] of cases) {
            const file = makeFakeFile(filename, 1_000);
            const torrent = makeTorrent([file]);
            const { req, res } = makeReqRes();

            handleTorrent(torrent, req, res);

            const callArgs = (res.writeHead as any).mock.calls.at(-1);
            expect(callArgs[1]['Content-Type']).toBe(expectedMime);
        }
    });
});

// ─── waitForReady ─────────────────────────────────────────────────────────────

describe('waitForReady', () => {
    it('resolves immediately when files are already populated', async () => {
        const torrent = makeTorrent([makeFakeFile()]);
        await expect(waitForReady(torrent, 100)).resolves.toBeUndefined();
    });

    it('resolves after the ready event fires', async () => {
        const torrent = makeTorrent([]); // starts empty
        // Emit ready after a short delay, populating files
        setTimeout(() => {
            torrent.files = [makeFakeFile()];
            torrent.emit('ready');
        }, 20);

        await expect(waitForReady(torrent, 1000)).resolves.toBeUndefined();
    });

    it('rejects when the torrent emits an error', async () => {
        const torrent = makeTorrent([]);
        setTimeout(() => torrent.emit('error', new Error('Metadata fetch failed')), 10);

        await expect(waitForReady(torrent, 1000)).rejects.toThrow('Metadata fetch failed');
    });

    it('rejects with a timeout error if ready never fires', async () => {
        const torrent = makeTorrent([]); // never emits ready
        await expect(waitForReady(torrent, 50)).rejects.toThrow('Torrent ready timeout');
    });
});

// ─── waitForReady: EventEmitter guard ────────────────────────────────────────

describe('waitForReady — defensive guard', () => {
    it('rejects immediately if the torrent object is not an EventEmitter', async () => {
        const notAnEmitter = { files: [] }; // plain object, no .once()
        await expect(waitForReady(notAnEmitter as any, 100)).rejects.toThrow(
            'Torrent object is not an EventEmitter',
        );
    });
});

// ─── streamRequest: missing magnet ────────────────────────────────────────────

describe('streamRequest — input validation', () => {
    it('returns 400 when magnet param is missing', async () => {
        const { streamRequest } = await import('../torrent.js');
        const { req, res } = makeReqRes();

        // streamRequest bails out before touching getClient()
        await streamRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith('Magnet link is missing');
    });
});


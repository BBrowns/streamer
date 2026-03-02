/**
 * Pure helper functions for torrent streaming — no webtorrent dependency.
 * Extracted to a separate module so they can be unit-tested without
 * vitest resolving the webtorrent ESM graph (which opens sockets and hangs).
 */
import path from 'path';
import type { Request, Response } from 'express';

/** Detect MIME type from file extension for correct Content-Type header */
export function mimeFromExt(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimes: Record<string, string> = {
        '.mp4': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.m4v': 'video/x-m4v',
        '.ts': 'video/mp2t',
    };
    return mimes[ext] ?? 'video/mp4';
}

/**
 * Wait for a torrent to be ready (files populated).
 *
 * webtorrent v2 fires `ready` once all metadata is received and
 * `torrent.files` is populated. The Torrent class extends EventEmitter.
 *
 * Times out after `timeoutMs` (default 30 s) to avoid infinite hangs.
 */
export function waitForReady(torrent: any, timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
        if (torrent.files && torrent.files.length > 0) {
            return resolve();
        }

        let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
            timer = null;
            cleanup();
            reject(new Error('Torrent ready timeout'));
        }, timeoutMs);

        function cleanup() {
            if (timer) { clearTimeout(timer); timer = null; }
            torrent.removeListener('ready', onReady);
            torrent.removeListener('error', onError);
        }

        function onReady() { cleanup(); resolve(); }
        function onError(err: Error) { cleanup(); reject(err); }

        torrent.once('ready', onReady);
        torrent.once('error', onError);
    });
}

/** Stream the largest video file from a torrent to an Express response */
export function handleTorrent(torrent: any, req: Request, res: Response) {
    const file: any = torrent.files.reduce((a: any, b: any) =>
        (a.length ?? 0) > (b.length ?? 0) ? a : b
    );

    const total: number = file.length;
    const contentType = mimeFromExt(file.name ?? '');
    const range = req.headers.range;

    if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : total - 1;
        const chunksize = end - start + 1;

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
        });

        const stream = file.createReadStream({ start, end });
        stream.pipe(res);
        req.on('close', () => stream.destroy());
    } else {
        res.writeHead(200, {
            'Content-Length': total,
            'Accept-Ranges': 'bytes',
            'Content-Type': contentType,
        });
        const stream = file.createReadStream();
        stream.pipe(res);
        req.on('close', () => stream.destroy());
    }
}

import { Request, Response } from 'express';
import path from 'path';

// Lazily initialized torrent client (webtorrent is ESM-only in v2+)
let client: any = null;

export async function getClient(): Promise<any> {
    if (!client) {
        const WebTorrent = (await import('webtorrent')).default;
        client = new WebTorrent();
    }
    return client;
}

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
 * Wait for a torrent's file list to be populated.
 *
 * KEY INSIGHT (webtorrent v2): The object returned by `client.add()` IS a full
 * EventEmitter torrent. The *callback* argument passed to `add(magnet, cb)` is
 * also the same torrent (fired on 'ready'), so both are valid EventEmitters.
 *
 * The `ready` event fires once all metadata is received and `torrent.files` is
 * populated. We set up our listeners BEFORE yielding control via Promise, so
 * there is no race between the event and the listener registration.
 *
 * Times out after `timeoutMs` (default 30 s) to avoid infinite hangs.
 */
export function waitForReady(torrent: any, timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
        // Fast path — files already populated (torrent metadata was cached)
        if (torrent.files && torrent.files.length > 0) {
            return resolve();
        }

        // Defensive guard: if the object is not an EventEmitter, reject cleanly
        if (typeof torrent.once !== 'function') {
            return reject(new Error(
                `Torrent object is not an EventEmitter (got ${typeof torrent}). ` +
                'Ensure you are using the return value of client.add(), not the callback argument.'
            ));
        }

        let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
            timer = null;
            torrent.removeListener('ready', onReady);
            torrent.removeListener('error', onError);
            reject(new Error('Torrent ready timeout'));
        }, timeoutMs);

        const cleanup = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            torrent.removeListener('ready', onReady);
            torrent.removeListener('error', onError);
        };

        const onReady = () => {
            cleanup();
            resolve();
        };

        const onError = (err: Error) => {
            cleanup();
            reject(err);
        };

        torrent.once('ready', onReady);
        torrent.once('error', onError);
    });
}

export async function streamRequest(req: Request, res: Response) {
    const magnet = req.query.magnet as string;

    if (!magnet) {
        return res.status(400).send('Magnet link is missing');
    }

    let torrent: any;

    try {
        const torrentClient = await getClient();

        // client.get() returns an existing torrent or null
        torrent = torrentClient.get(magnet);

        if (!torrent) {
            // IMPORTANT: In webtorrent v2, client.add() returns the torrent
            // synchronously as a full EventEmitter. We use this return value
            // (not the callback argument) for event listening.
            torrent = torrentClient.add(magnet);
        }

        await waitForReady(torrent);
    } catch (err: any) {
        const msg = err?.message ?? 'Failed to load torrent';
        console.error('[stream-server] torrent error:', msg);
        if (!res.headersSent) {
            return res.status(503).send(`Torrent unavailable: ${msg}`);
        }
        return;
    }

    if (!torrent.files || torrent.files.length === 0) {
        return res.status(503).send('Torrent has no files');
    }

    handleTorrent(torrent, req, res);
}

export function handleTorrent(torrent: any, req: Request, res: Response) {
    // Pick the largest file — most likely the main video
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

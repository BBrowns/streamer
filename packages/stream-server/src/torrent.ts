/**
 * Torrent streaming handler — integrates with webtorrent v2 (ESM-only).
 *
 * Helpers (handleTorrent, waitForReady, mimeFromExt) are extracted to
 * torrent-helpers.ts so they can be unit-tested without triggering the
 * heavyweight webtorrent ESM import graph.
 */
import { Request, Response } from 'express';
import { handleTorrent, waitForReady } from './torrent-helpers.js';

// Re-export for stat.ts and other consumers
export { handleTorrent, waitForReady, mimeFromExt } from './torrent-helpers.js';

// Lazily initialized torrent client (webtorrent is ESM-only in v2+)
let client: any = null;

export async function getClient(): Promise<any> {
    if (!client) {
        const WebTorrent = (await import('webtorrent')).default;
        client = new WebTorrent();
    }
    return client;
}

export async function streamRequest(req: Request, res: Response) {
    const magnet = req.query.magnet as string;

    if (!magnet) {
        return res.status(400).send('Magnet link is missing');
    }

    let torrent: any;

    try {
        const torrentClient = await getClient();

        // IMPORTANT: In webtorrent v2, client.get() is ASYNC (returns Promise).
        // Must await it — otherwise we get a raw Promise object, not a Torrent.
        const existing = await torrentClient.get(magnet);

        if (existing) {
            torrent = existing;
        } else {
            // client.add() returns the Torrent synchronously (extends EventEmitter).
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

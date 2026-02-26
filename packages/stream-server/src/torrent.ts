import { Request, Response } from 'express';

// Lazily initialized torrent client (webtorrent is ESM-only)
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

    const torrentClient = await getClient();
    let torrent = torrentClient.get(magnet);

    if (torrent) {
        handleTorrent(torrent, req, res);
    } else {
        torrentClient.add(magnet, (newTorrent: any) => {
            handleTorrent(newTorrent, req, res);
        });
    }
}

function handleTorrent(torrent: any, req: Request, res: Response) {
    // Find the largest file (assume it's the video)
    const file = torrent.files.reduce((a, b) => (a.length > b.length ? a : b));

    const total = file.length;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const partialstart = parts[0];
        const partialend = parts[1];

        const start = parseInt(partialstart, 10);
        const end = partialend ? parseInt(partialend, 10) : total - 1;
        const chunksize = end - start + 1;

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        });

        const stream = file.createReadStream({ start, end });
        stream.pipe(res);

        req.on('close', () => (stream as any).destroy());
    } else {
        res.writeHead(200, {
            'Content-Length': total,
            'Content-Type': 'video/mp4',
        });
        const stream = file.createReadStream();
        stream.pipe(res);

        req.on('close', () => (stream as any).destroy());
    }
}

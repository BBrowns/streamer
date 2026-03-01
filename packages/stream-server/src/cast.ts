/**
 * Cast Router — Chromecast device discovery & control
 *
 * Replaces the abandoned chromecast-api (vulnerable to ip/xml2js CVEs) with
 * a lightweight mDNS-based discovery via the `bonjour-service` package
 * (actively maintained, zero known CVEs) and direct castv2 for playback.
 */
import { Router, Request, Response } from 'express';
import type { Client as CastClientType } from 'castv2-client';

const router = Router();

interface CastDevice {
    id: string;
    name: string;
    host: string;
    port: number;
    type: 'chromecast';
}

let devices: CastDevice[] = [];
let bonjour: any = null;

// Lazy-start mDNS discovery when first requested
async function startDiscovery() {
    if (bonjour) return;
    try {
        const { default: Bonjour } = await import('bonjour-service');
        bonjour = new Bonjour();
        const browser = bonjour.find({ type: 'googlecast' });

        browser.on('up', (service: any) => {
            const host = service.addresses?.[0] ?? service.host;
            const id = `${host}:${service.port}`;
            if (!devices.find((d) => d.id === id)) {
                devices.push({
                    id,
                    name: service.txt?.fn ?? service.name ?? 'Chromecast',
                    host,
                    port: service.port,
                    type: 'chromecast',
                });
            }
        });

        browser.on('down', (service: any) => {
            const host = service.addresses?.[0] ?? service.host;
            const id = `${host}:${service.port}`;
            devices = devices.filter((d) => d.id !== id);
        });
    } catch (err) {
        console.error('Failed to start bonjour discovery:', err);
    }
}

router.get('/devices', async (_req: Request, res: Response) => {
    await startDiscovery();
    res.json(devices.map(({ id, name, type }) => ({ id, name, type })));
});

router.post('/play', async (req: Request, res: Response) => {
    const { deviceId, url, title } = req.body as { deviceId: string; url: string; title?: string };
    const device = devices.find((d) => d.id === deviceId);

    if (!device) {
        return res.status(404).json({ error: 'Device not found' });
    }

    try {
        const { Client, DefaultMediaReceiver } = await import('castv2-client');
        const client = new Client() as unknown as CastClientType;

        await new Promise<void>((resolve, reject) => {
            client.connect({ host: device.host, port: device.port }, (err: Error) => {
                if (err) return reject(err);
                resolve();
            });
        });

        const player: any = await new Promise((resolve, reject) => {
            client.launch(DefaultMediaReceiver, (err: Error, app: any) => {
                if (err) return reject(err);
                resolve(app);
            });
        });

        await new Promise<void>((resolve, reject) => {
            player.load(
                {
                    contentId: url,
                    contentType: 'video/mp4',
                    streamType: 'BUFFERED',
                    metadata: {
                        type: 0,
                        metadataType: 0,
                        title: title ?? 'Streamer',
                    },
                },
                { autoplay: true },
                (err: Error) => {
                    if (err) return reject(err);
                    resolve();
                },
            );
        });

        client.close();
        return res.json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message ?? 'Failed to cast' });
    }
});

router.post('/control', async (req: Request, res: Response) => {
    const { deviceId, action } = req.body as { deviceId: string; action: string };
    const device = devices.find((d) => d.id === deviceId);

    if (!device) {
        return res.status(404).json({ error: 'Device not found' });
    }

    if (!['pause', 'resume', 'play', 'stop'].includes(action)) {
        return res.status(400).json({ error: 'Unknown action' });
    }

    try {
        const { Client, DefaultMediaReceiver } = await import('castv2-client');
        const client = new Client() as unknown as CastClientType;

        await new Promise<void>((resolve, reject) => {
            client.connect({ host: device.host, port: device.port }, (err: Error) => {
                if (err) return reject(err);
                resolve();
            });
        });

        const sessions: any[] = await new Promise((resolve, reject) => {
            client.getSessions((err: Error, sessions: any[]) => {
                if (err) return reject(err);
                resolve(sessions);
            });
        });

        if (!sessions.length) {
            client.close();
            return res.status(404).json({ error: 'No active session' });
        }

        const player: any = await new Promise((resolve, reject) => {
            client.join(sessions[0], DefaultMediaReceiver, (err: Error, app: any) => {
                if (err) return reject(err);
                resolve(app);
            });
        });

        await new Promise<void>((resolve, reject) => {
            const cb = (err: Error) => (err ? reject(err) : resolve());
            if (action === 'pause') player.pause(cb);
            else if (action === 'stop') player.stop(cb);
            else player.play(cb);
        });

        client.close();
        return res.json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message ?? 'Control failed' });
    }
});

export const castRouter = router;

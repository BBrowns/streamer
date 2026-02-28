import { Router } from 'express';
// @ts-ignore
import ChromecastAPI from 'chromecast-api';
// @ts-ignore
import AirPlay from 'airplay-protocol';

const router = Router();
const chromecastBrowser = new ChromecastAPI();
let devices: any[] = [];

chromecastBrowser.on('device', (device: any) => {
    // Check if device is already added
    if (!devices.find((d) => d.host === device.host)) {
        devices.push({
            id: device.host,
            name: device.friendlyName,
            type: 'chromecast',
            _device: device,
        });
    }
});

// For AirPlay, discovery requires mdns or dnssd, which airplay-protocol doesn't do out of the box.
// A full implementation would require a Bonjour browser.
// For now, we'll focus on the Chromecast integration as requested and mock AirPlay if needed,
// but the plan mentioned both. To keep it simple, we'll expose Cast for now.

router.get('/devices', (req, res) => {
    const list = devices.map(d => ({ id: d.id, name: d.name, type: d.type }));
    res.json(list);
});

router.post('/play', (req, res) => {
    const { deviceId, url, title } = req.body;
    const device = devices.find(d => d.id === deviceId);

    if (!device) {
        return res.status(404).json({ error: 'Device not found' });
    }

    if (device.type === 'chromecast') {
        device._device.play(url, { title }, (err: any) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    } else {
        res.status(400).json({ error: 'Unsupported device type' });
    }
});

router.post('/control', (req, res) => {
    const { deviceId, action } = req.body;
    const device = devices.find(d => d.id === deviceId);

    if (!device) {
        return res.status(404).json({ error: 'Device not found' });
    }

    if (device.type === 'chromecast') {
        const castDevice = device._device;
        switch (action) {
            case 'pause':
                castDevice.pause(() => res.json({ success: true }));
                break;
            case 'resume':
            case 'play':
                castDevice.resume(() => res.json({ success: true }));
                break;
            case 'stop':
                castDevice.stop(() => res.json({ success: true }));
                break;
            default:
                res.status(400).json({ error: 'Unknown action' });
        }
    } else {
        res.status(400).json({ error: 'Unsupported device type' });
    }
});

export const castRouter = router;

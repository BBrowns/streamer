/**
 * Cast Router — Chromecast device discovery & control
 *
 * Replaces the abandoned chromecast-api (vulnerable to ip/xml2js CVEs) with
 * a lightweight mDNS-based discovery via the `bonjour-service` package
 * (actively maintained, zero known CVEs) and direct castv2 for playback.
 */
import { Router, Request, Response } from "express";
import type { Client as CastClientType } from "castv2-client";
import { requireBridgeAuth, validateCastPlaybackUrl } from "./security.js";
import { redactSensitiveText } from "./redaction.js";

const router = Router();
router.use(requireBridgeAuth);

interface CastDevice {
  id: string;
  name: string;
  host: string;
  port: number;
  type: "chromecast";
}

const CAST_CONTENT_TYPES = new Set([
  "video/mp4",
  "application/vnd.apple.mpegurl",
  "application/x-mpegURL",
]);

export function getSafeCastContentType(contentType?: string) {
  return contentType && CAST_CONTENT_TYPES.has(contentType)
    ? contentType
    : "video/mp4";
}

let devices: CastDevice[] = [];
let bonjour: any = null;

// Lazy-start mDNS discovery when first requested
async function startDiscovery() {
  if (bonjour) return;
  try {
    const { default: Bonjour } = await import("bonjour-service");
    bonjour = new Bonjour();
    const browser = bonjour.find({ type: "googlecast" });

    browser.on("up", (service: any) => {
      const host = service.addresses?.[0] ?? service.host;
      const id = `${host}:${service.port}`;
      if (!devices.find((d) => d.id === id)) {
        devices.push({
          id,
          name: service.txt?.fn ?? service.name ?? "Chromecast",
          host,
          port: service.port,
          type: "chromecast",
        });
      }
    });

    browser.on("down", (service: any) => {
      const host = service.addresses?.[0] ?? service.host;
      const id = `${host}:${service.port}`;
      devices = devices.filter((d) => d.id !== id);
    });
  } catch (err) {
    console.error(
      "Failed to start bonjour discovery:",
      redactSensitiveText(String((err as Error | undefined)?.message ?? err)),
    );
  }
}

router.get("/devices", async (_req: Request, res: Response) => {
  await startDiscovery();
  res.json(devices.map(({ id, name, type }) => ({ id, name, type })));
});

router.post("/play", async (req: Request, res: Response) => {
  const { deviceId, url, title, contentType } = req.body as {
    deviceId: string;
    url: string;
    title?: string;
    contentType?: string;
  };
  const device = devices.find((d) => d.id === deviceId);
  const safeUrl = validateCastPlaybackUrl(url, {
    allowedHosts: [req.hostname, req.get("host")].filter(
      (host): host is string => Boolean(host),
    ),
  });

  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }

  if (!safeUrl.ok) {
    return res.status(400).json({ error: safeUrl.reason });
  }

  const safeContentType = getSafeCastContentType(contentType);

  try {
    const { Client, DefaultMediaReceiver } = await import("castv2-client");
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
          contentId: safeUrl.url!,
          contentType: safeContentType,
          streamType: "BUFFERED",
          metadata: {
            type: 0,
            metadataType: 0,
            title: title ?? "Streamer",
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
    return res
      .status(500)
      .json({ error: redactSensitiveText(err?.message ?? "Failed to cast") });
  }
});

router.post("/control", async (req: Request, res: Response) => {
  const { deviceId, action, position } = req.body as {
    deviceId: string;
    action: string;
    position?: number;
  };
  const device = devices.find((d) => d.id === deviceId);

  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }

  if (!["pause", "resume", "play", "stop", "seek"].includes(action)) {
    return res.status(400).json({ error: "Unknown action" });
  }
  if (
    action === "seek" &&
    (typeof position !== "number" || !Number.isFinite(position) || position < 0)
  ) {
    return res.status(400).json({ error: "Invalid seek position" });
  }

  try {
    const { Client, DefaultMediaReceiver } = await import("castv2-client");
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
      return res.status(404).json({ error: "No active session" });
    }

    const player: any = await new Promise((resolve, reject) => {
      client.join(sessions[0], DefaultMediaReceiver, (err: Error, app: any) => {
        if (err) return reject(err);
        resolve(app);
      });
    });

    await new Promise<void>((resolve, reject) => {
      const cb = (err: Error) => (err ? reject(err) : resolve());
      if (action === "pause") player.pause(cb);
      else if (action === "stop") player.stop(cb);
      else if (action === "seek") player.seek(position, cb);
      else player.play(cb);
    });

    client.close();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Control failed" });
  }
});

router.get("/status/:deviceId", async (req: Request, res: Response) => {
  const device = devices.find(
    (candidate) => candidate.id === req.params.deviceId,
  );
  if (!device) return res.status(404).json({ error: "Device not found" });

  try {
    const { Client, DefaultMediaReceiver } = await import("castv2-client");
    const client = new Client() as unknown as CastClientType;
    await new Promise<void>((resolve, reject) => {
      client.connect({ host: device.host, port: device.port }, (err: Error) =>
        err ? reject(err) : resolve(),
      );
    });
    const sessions: any[] = await new Promise((resolve, reject) => {
      client.getSessions((err: Error, currentSessions: any[]) =>
        err ? reject(err) : resolve(currentSessions),
      );
    });
    if (!sessions.length) {
      client.close();
      return res.status(404).json({ error: "No active session" });
    }
    const player: any = await new Promise((resolve, reject) => {
      client.join(sessions[0], DefaultMediaReceiver, (err: Error, app: any) =>
        err ? reject(err) : resolve(app),
      );
    });
    const status: any = await new Promise((resolve, reject) => {
      player.getStatus((err: Error, currentStatus: any) =>
        err ? reject(err) : resolve(currentStatus),
      );
    });
    client.close();
    return res.json({
      currentTime: Number(status?.currentTime) || 0,
      duration: Number(status?.media?.duration) || 0,
      isPaused: status?.playerState !== "PLAYING",
      playerState: status?.playerState || "UNKNOWN",
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: redactSensitiveText(err?.message ?? "Status failed") });
  }
});

export const castRouter = router;

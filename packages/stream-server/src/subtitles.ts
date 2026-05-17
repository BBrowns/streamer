import { Request, Response } from "express";
import { spawn } from "child_process";
import { getClient, waitForReady, validateTorrentFiles } from "./torrent.js";
import path from "path";

export interface SubtitleTrack {
  id: string; // "internal:0" or "external:0"
  label: string;
  language?: string;
  type: "internal" | "external";
  url: string;
}

/**
 * Detect available subtitle tracks (internal embedded and external files).
 */
export async function getSubtitlesRequest(req: Request, res: Response) {
  const magnet = req.query.magnet as string;
  if (!magnet) return res.status(400).json({ error: "Magnet is required" });

  try {
    const client = await getClient();
    const torrent = (await client.get(magnet)) || client.add(magnet);
    await waitForReady(torrent, 60_000);
    validateTorrentFiles(torrent);

    const tracks: SubtitleTrack[] = [];
    const host = req.get("host") || "127.0.0.1";
    const baseUrl = `${req.protocol}://${host}`;

    // 1. Detect external files (.srt, .vtt)
    torrent.files.forEach((file: any, index: number) => {
      const ext = path.extname(file.name).toLowerCase();
      if ([".srt", ".vtt"].includes(ext)) {
        tracks.push({
          id: `external:${index}`,
          label: file.name,
          type: "external",
          url: `${baseUrl}/api/subtitles/external:${index}/stream?magnet=${encodeURIComponent(magnet)}`,
        });
      }
    });

    // 2. Detect internal embedded tracks using ffprobe on the largest file
    const largestFile = torrent.files.reduce((a: any, b: any) =>
      (a.length || 0) > (b.length || 0) ? a : b,
    );

    const addr = client.server.address();
    if (!addr || typeof addr === "string") {
      return res.status(503).json({ error: "Storage server not ready" });
    }
    const streamUrl = `http://127.0.0.1:${addr.port}${largestFile.streamURL}`;

    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=index,codec_name:stream_tags=language,title",
      "-select_streams",
      "s",
      "-of",
      "json",
      streamUrl,
    ]);

    let output = "";
    ffprobe.stdout.on("data", (data) => (output += data));

    await new Promise((resolve) => ffprobe.on("close", resolve));

    try {
      const data = JSON.parse(output);
      if (data.streams) {
        data.streams.forEach((s: any) => {
          const lang = s.tags?.language || "unknown";
          const title = s.tags?.title || `Track ${s.index}`;
          tracks.push({
            id: `internal:${s.index}`,
            label: `${title} (${lang})`,
            language: lang,
            type: "internal",
            url: `${baseUrl}/api/subtitles/internal:${s.index}/stream?magnet=${encodeURIComponent(magnet)}`,
          });
        });
      }
    } catch (e) {
      console.warn(
        "[subtitles] Failed to parse ffprobe output or no internal tracks found",
      );
    }

    res.json({ tracks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Stream a specific subtitle track.
 */
export async function streamSubtitleRequest(req: Request, res: Response) {
  const { id } = req.params;
  const magnet = req.query.magnet as string;

  if (!magnet || !id)
    return res.status(400).json({ error: "Missing magnet or track ID" });

  try {
    const client = await getClient();
    const torrent = await client.get(magnet);
    if (!torrent) return res.status(404).json({ error: "Torrent not found" });

    const [type, indexStr] = id.split(":");
    const index = parseInt(indexStr, 10);

    if (type === "external") {
      const file = torrent.files[index];
      if (!file)
        return res.status(404).json({ error: "Subtitle file not found" });
      const streamPath = file.streamURL;
      const addr = client.server.address();
      if (!addr || typeof addr === "string")
        return res.status(503).json({ error: "Storage server not ready" });
      const externalUrl = `http://${req.hostname}:${addr.port}${streamPath}`;
      return res.redirect(302, externalUrl);
    }

    if (type === "internal") {
      const largestFile = torrent.files.reduce((a: any, b: any) =>
        (a.length || 0) > (b.length || 0) ? a : b,
      );
      const addr = client.server.address();
      if (!addr || typeof addr === "string")
        return res.status(503).json({ error: "Storage server not ready" });
      const streamUrl = `http://127.0.0.1:${addr.port}${largestFile.streamURL}`;

      console.log(
        `[subtitles] Extracting internal VTT track ${index} from ${largestFile.name}`,
      );

      res.setHeader("Content-Type", "text/vtt");
      res.setHeader("Cache-Control", "no-cache");

      const ffmpeg = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        streamUrl,
        "-map",
        `0:${index}`,
        "-f",
        "webvtt",
        "pipe:1",
      ]);

      ffmpeg.stdout.pipe(res);

      res.on("close", () => {
        ffmpeg.kill("SIGTERM");
      });

      ffmpeg.on("error", (err) => {
        console.error("[subtitles] FFmpeg extraction error:", err.message);
        if (!res.headersSent) res.status(500).end();
      });

      return;
    }

    res.status(400).json({ error: "Invalid track type" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

import type { Stream } from "@streamer/shared";
import type {
  IDebridResolver,
  ResolvedStream,
  DebridAccountStatus,
} from "../ports/debrid.ports.js";
import { logger } from "../../../config/logger.js";
import { validateExternalNavigationUrl } from "@streamer/shared";

const MAX_REAL_DEBRID_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TORRENT_FILES = 4_096;
const MAX_TORRENT_ID_LENGTH = 128;

async function readBoundedResponseText(response: Response): Promise<string> {
  const contentLength = Number(response.headers?.get?.("content-length") || 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_REAL_DEBRID_RESPONSE_BYTES
  ) {
    throw new Error("Real-Debrid response exceeded the size limit");
  }

  const body = response.body;
  if (!body || typeof body.getReader !== "function") {
    const text =
      typeof response.text === "function"
        ? await response.text()
        : JSON.stringify(await response.json());
    if (
      new TextEncoder().encode(text).byteLength > MAX_REAL_DEBRID_RESPONSE_BYTES
    ) {
      throw new Error("Real-Debrid response exceeded the size limit");
    }
    return text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REAL_DEBRID_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Real-Debrid response exceeded the size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Real-Debrid adapter.
 *
 * Receives a user-scoped OAuth access token from the integration service. The
 * adapter deliberately has no process-wide credential fallback.
 */
export class RealDebridResolver implements IDebridResolver {
  private readonly accessToken: string;

  constructor(accessToken = "") {
    this.accessToken = accessToken;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: URLSearchParams,
  ): Promise<T> {
    const url = `https://api.real-debrid.com/rest/1.0${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
    };

    const options: RequestInit = { method, headers };

    if (body) {
      options.body = body;
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const res = await fetch(url, options);
    if (!res.ok) {
      // Consume errors through the same bounded reader as successful
      // responses. Do not include the upstream body in the thrown error: it
      // is untrusted data and is not needed by callers or logs.
      await readBoundedResponseText(res);
      throw new Error(`Real-Debrid API error: ${res.status}`);
    }

    if (res.status === 204) {
      return {} as T;
    }

    const text = await readBoundedResponseText(res);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error("Real-Debrid returned invalid JSON");
    }
  }

  canResolve(stream: Stream): boolean {
    return Boolean(this.accessToken && stream.infoHash);
  }

  async resolve(
    stream: Stream,
    requestId: string,
  ): Promise<ResolvedStream | null> {
    if (!this.accessToken || !stream.infoHash) {
      logger.debug(
        { requestId },
        "Real-Debrid not configured or no infoHash, skipping",
      );
      return null;
    }

    try {
      // 1. Add Magnet
      const magnet = `magnet:?xt=urn:btih:${stream.infoHash}`;
      const addForm = new URLSearchParams();
      addForm.append("magnet", magnet);

      const addRes = await this.request<{ id: string; uri: string }>(
        "POST",
        "/torrents/addMagnet",
        addForm,
      );
      const torrentId = String(addRes.id || "");
      if (
        !torrentId ||
        torrentId.length > MAX_TORRENT_ID_LENGTH ||
        !/^[A-Za-z0-9_-]+$/.test(torrentId)
      ) {
        throw new Error("Real-Debrid returned an invalid torrent id");
      }

      // 2. Get Torrent Info
      let info = await this.request<any>("GET", `/torrents/info/${torrentId}`);

      // 3. Select Files (if pending)
      if (info.status === "waiting_files_selection") {
        if (
          !Array.isArray(info.files) ||
          info.files.length > MAX_TORRENT_FILES
        ) {
          throw new Error("Real-Debrid returned too many torrent files");
        }
        const videoExts = [
          ".mp4",
          ".mkv",
          ".avi",
          ".webm",
          ".ts",
          ".m4v",
          ".mov",
        ];
        const videoFiles = info.files.filter((f: any) =>
          videoExts.some((ext) => f.path.toLowerCase().endsWith(ext)),
        );

        let targetFileId = "all";
        if (videoFiles.length > 0) {
          // Find the largest video file
          const largest = videoFiles.reduce((a: any, b: any) =>
            a.bytes > b.bytes ? a : b,
          );
          targetFileId = largest.id.toString();
        }

        const selectForm = new URLSearchParams();
        selectForm.append("files", targetFileId);
        await this.request(
          "POST",
          `/torrents/selectFiles/${torrentId}`,
          selectForm,
        );

        // Refetch info after selection
        info = await this.request<any>("GET", `/torrents/info/${torrentId}`);
      }

      // 4. Wait for caching/download
      // For streaming, we ideally want instantly cached torrents. We will poll briefly.
      let attempts = 0;
      while (
        info.status !== "downloaded" &&
        info.status !== "error" &&
        info.status !== "dead" &&
        attempts < 5
      ) {
        await new Promise((r) => setTimeout(r, 1000));
        info = await this.request<any>("GET", `/torrents/info/${torrentId}`);
        attempts++;
      }

      if (
        info.status !== "downloaded" ||
        !info.links ||
        info.links.length === 0
      ) {
        logger.warn(
          { requestId, status: info.status },
          "Real-Debrid torrent not cached or failed",
        );
        // Clean up the unfinished torrent from the user's account
        await this.request("DELETE", `/torrents/delete/${torrentId}`).catch(
          () => {},
        );
        return null;
      }

      // 5. Unrestrict the hoster link
      const link = info.links[0];
      if (
        typeof link !== "string" ||
        link.length === 0 ||
        link.length > 8_192
      ) {
        throw new Error("Real-Debrid returned an invalid hoster link");
      }
      const unrestrictForm = new URLSearchParams();
      unrestrictForm.append("link", link);

      const unrestrictRes = await this.request<any>(
        "POST",
        "/unrestrict/link",
        unrestrictForm,
      );

      const safeDownloadUrl = validateExternalNavigationUrl(
        unrestrictRes.download,
      );
      if (safeDownloadUrl) {
        logger.info(
          { requestId, stream: stream.title },
          "Real-Debrid resolved successfully",
        );
        return {
          url: safeDownloadUrl,
          host:
            typeof unrestrictRes.host === "string"
              ? unrestrictRes.host.slice(0, 256)
              : undefined,
          size:
            typeof unrestrictRes.filesize === "number" &&
            Number.isFinite(unrestrictRes.filesize) &&
            unrestrictRes.filesize >= 0
              ? unrestrictRes.filesize
              : undefined,
        };
      }
    } catch (error: any) {
      logger.error(
        { requestId, errorName: error?.name || "Error" },
        "Real-Debrid resolution error",
      );
    }

    return null;
  }

  async getAccountStatus(): Promise<DebridAccountStatus> {
    try {
      const user = await this.request<any>("GET", "/user");
      return {
        isActive: true,
        isPremium: user.premium > 0,
        expiresAt: user.expiration,
      };
    } catch {
      return { isActive: false, isPremium: false };
    }
  }
}

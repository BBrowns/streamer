import type { Stream } from "@streamer/shared";
import type {
  IDebridResolver,
  ResolvedStream,
  DebridAccountStatus,
} from "../ports/debrid.ports.js";
import { logger } from "../../../config/logger.js";

/**
 * Real-Debrid adapter.
 *
 * Requires `RD_API_TOKEN` environment variable.
 * Implements the Real-Debrid API v2:
 * https://api.real-debrid.com/rest/2.0/
 */
export class RealDebridResolver implements IDebridResolver {
  private readonly apiToken: string | undefined;

  constructor() {
    this.apiToken = process.env.RD_API_TOKEN;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: URLSearchParams,
  ): Promise<T> {
    const url = `https://api.real-debrid.com/rest/2.0${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
    };

    const options: RequestInit = { method, headers };

    if (body) {
      options.body = body;
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Real-Debrid API error: ${res.status} ${text}`);
    }

    if (res.status === 204) {
      return {} as T;
    }

    return res.json() as Promise<T>;
  }

  canResolve(stream: Stream): boolean {
    if (!this.apiToken) return false;
    return !!stream.infoHash;
  }

  async resolve(
    stream: Stream,
    requestId: string,
  ): Promise<ResolvedStream | null> {
    if (!this.apiToken || !stream.infoHash) {
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
      const torrentId = addRes.id;

      // 2. Get Torrent Info
      let info = await this.request<any>("GET", `/torrents/info/${torrentId}`);

      // 3. Select Files (if pending)
      if (info.status === "waiting_files_selection") {
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
      const unrestrictForm = new URLSearchParams();
      unrestrictForm.append("link", link);

      const unrestrictRes = await this.request<any>(
        "POST",
        "/unrestrict/link",
        unrestrictForm,
      );

      if (unrestrictRes.download) {
        logger.info(
          { requestId, stream: stream.title },
          "Real-Debrid resolved successfully",
        );
        return {
          url: unrestrictRes.download,
          host: unrestrictRes.host,
          size: unrestrictRes.filesize,
        };
      }
    } catch (error: any) {
      logger.error(
        { requestId, err: error.message },
        "Real-Debrid resolution error",
      );
    }

    return null;
  }

  async getAccountStatus(): Promise<DebridAccountStatus> {
    if (!this.apiToken) {
      return { isActive: false, isPremium: false };
    }

    try {
      const user = await this.request<any>("GET", "/user");
      return {
        isActive: true,
        isPremium: user.premium > 0,
        expiresAt: user.expiration,
      };
    } catch (error) {
      return { isActive: false, isPremium: false };
    }
  }
}

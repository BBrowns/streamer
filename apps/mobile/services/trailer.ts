import type { MediaTrailer } from "@streamer/shared";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const ALLOWED_TRAILER_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

/**
 * Converts provider metadata into a safe external trailer destination. Add-ons
 * are untrusted, so this deliberately supports only YouTube identifiers and
 * HTTPS links on YouTube hosts.
 */
export function getSafeTrailerUrl(
  trailers: readonly MediaTrailer[] | undefined,
): string | null {
  for (const trailer of trailers ?? []) {
    const source = trailer.source.trim();
    if (YOUTUBE_ID.test(source)) {
      return `https://www.youtube.com/watch?v=${source}`;
    }

    try {
      const url = new URL(source);
      if (
        url.protocol === "https:" &&
        ALLOWED_TRAILER_HOSTS.has(url.hostname)
      ) {
        return url.toString();
      }
    } catch {
      // Provider data is optional. Ignore a malformed trailer rather than
      // allowing it to become an arbitrary external navigation target.
    }
  }
  return null;
}

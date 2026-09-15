import type { Stream } from "@streamer/shared";

export const StreamParser = {
  /** Parse title for resolution and seeders */
  enrich(stream: Stream): Stream {
    const title = stream.title || stream.name || "";

    // Parse resolution (4K, 2160p, 1080p, 720p, 480p)
    if (!stream.resolution) {
      if (/4k|2160p/i.test(title)) stream.resolution = "2160p";
      else if (/1080p/i.test(title)) stream.resolution = "1080p";
      else if (/720p/i.test(title)) stream.resolution = "720p";
      else if (/480p/i.test(title)) stream.resolution = "480p";
    }

    // Parse seeders if present in title. Providers use several labels for the
    // same value, including the person icons used by Torrentio/Comet. Keep
    // this as a title hint only: an explicit structured value remains
    // authoritative.
    if (stream.seeders === undefined) {
      const seederMatch =
        title.match(/S:\s*([\d,]+)/i) ||
        title.match(/([\d,]+)\s*seeders/i) ||
        title.match(/[👤👥]\s*([\d,]+)/u);
      if (seederMatch) {
        const parsed = Number.parseInt(seederMatch[1].replaceAll(",", ""), 10);
        if (Number.isSafeInteger(parsed) && parsed >= 0) {
          stream.seeders = parsed;
        }
      }
    }

    return stream;
  },

  /** Sort by resolution (desc) then seeders (desc) */
  compare(a: Stream, b: Stream): number {
    const resMap: Record<string, number> = {
      "2160p": 4,
      "1080p": 3,
      "720p": 2,
      "480p": 1,
    };

    const resA = resMap[a.resolution || ""] || 0;
    const resB = resMap[b.resolution || ""] || 0;

    if (resA !== resB) return resB - resA;
    return (b.seeders || 0) - (a.seeders || 0);
  },
};

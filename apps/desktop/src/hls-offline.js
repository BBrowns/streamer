"use strict";

// HLS offline support intentionally accepts only finite media playlists. A
// master playlist, a live playlist, encrypted media, and byte-range segments
// all need a different runtime (variant selection, key management, or range
// reconstruction) and must not silently fall back to an unsafe generic file
// download.
const HLS_LIMITS = Object.freeze({
  maxPlaylistBytes: 2 * 1024 * 1024,
  maxSegments: 720,
  maxDurationSeconds: 8 * 60 * 60,
  maxSegmentBytes: 512 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024 * 1024,
});

function isHlsUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ""));
    return parsed.pathname.toLowerCase().endsWith(".m3u8");
  } catch {
    return false;
  }
}

function parseAttributeList(rawValue) {
  const attributes = {};
  let current = "";
  let quoted = false;
  const values = [];

  for (const character of String(rawValue || "")) {
    if (character === '"') quoted = !quoted;
    if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current);

  for (const item of values) {
    const separator = item.indexOf("=");
    if (separator <= 0) continue;
    const key = item.slice(0, separator).trim().toUpperCase();
    const value = item.slice(separator + 1).trim();
    attributes[key] = value.replace(/^"|"$/g, "");
  }
  return attributes;
}

function resolveResourceUrl(rawValue, playlistUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawValue || ""), playlistUrl);
  } catch {
    throw new Error("HLS playlist contains an invalid resource URI");
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error("HLS playlist contains an unsafe resource URI");
  }
  return parsed.toString();
}

function rewriteUriAttribute(line, localPath) {
  return line.replace(/URI\s*=\s*(?:"[^"]*"|[^,\s]+)/i, `URI="${localPath}"`);
}

function parseDuration(line) {
  const match = /^#EXTINF:([0-9]+(?:\.[0-9]+)?)/i.exec(line);
  if (!match) return 0;
  const duration = Number(match[1]);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

/**
 * Parse and rewrite one finite HLS media playlist.
 *
 * The returned manifest never contains a remote URL. Each resource is mapped
 * to a managed relative path so Electron can serve it through streamer://.
 */
function parseHlsMediaPlaylist(
  text,
  playlistUrl,
  segmentPrefix = "segments",
  limits = HLS_LIMITS,
) {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("HLS playlist is empty");
  }
  if (Buffer.byteLength(text, "utf8") > limits.maxPlaylistBytes) {
    throw new Error("HLS playlist is too large");
  }

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "#EXTM3U") {
    throw new Error("HLS playlist is invalid");
  }
  if (lines.some((line) => /^#EXT-X-STREAM-INF:/i.test(line.trim()))) {
    throw new Error("HLS master playlists are not supported for offline use");
  }
  if (!lines.some((line) => /^#EXT-X-ENDLIST\s*$/i.test(line.trim()))) {
    throw new Error("Live HLS playlists cannot be saved offline");
  }

  const resources = [];
  const rewritten = [];
  let durationSeconds = 0;
  let segmentIndex = 0;
  let initIndex = 0;
  const ensureResourceBound = () => {
    if (resources.length > limits.maxSegments + 1) {
      throw new Error("HLS playlist has too many resources");
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^#EXT-X-KEY:/i.test(line)) {
      const attributes = parseAttributeList(line.slice(line.indexOf(":") + 1));
      if (attributes.METHOD && attributes.METHOD.toUpperCase() !== "NONE") {
        throw new Error("Encrypted HLS playlists cannot be saved offline");
      }
      if (attributes.URI) {
        throw new Error("HLS key resources cannot be saved offline");
      }
    }
    if (/^#EXT-X-BYTERANGE:/i.test(line)) {
      throw new Error("HLS byte-range segments are not supported offline");
    }

    const mapMatch = /^#EXT-X-MAP:(.*)$/i.exec(line);
    if (mapMatch) {
      const attributes = parseAttributeList(mapMatch[1]);
      if (!attributes.URI) throw new Error("HLS initialization URI is missing");
      if (attributes.BYTERANGE) {
        throw new Error(
          "HLS initialization byte-ranges are not supported offline",
        );
      }
      const localPath = `${segmentPrefix}/init-${String(initIndex++).padStart(4, "0")}.bin`;
      resources.push({
        kind: "init",
        url: resolveResourceUrl(attributes.URI, playlistUrl),
        localPath,
      });
      ensureResourceBound();
      rewritten.push(rewriteUriAttribute(line, localPath));
      continue;
    }

    if (line.startsWith("#") && /URI\s*=/i.test(line)) {
      throw new Error("HLS auxiliary resources are not supported offline");
    }

    durationSeconds += parseDuration(line);
    if (durationSeconds > limits.maxDurationSeconds) {
      throw new Error("HLS playlist duration exceeds the offline limit");
    }

    if (line && !line.startsWith("#")) {
      segmentIndex += 1;
      if (segmentIndex > limits.maxSegments) {
        throw new Error("HLS playlist has too many segments");
      }
      const localPath = `${segmentPrefix}/segment-${String(segmentIndex).padStart(4, "0")}.bin`;
      resources.push({
        kind: "segment",
        url: resolveResourceUrl(line, playlistUrl),
        localPath,
      });
      ensureResourceBound();
      rewritten.push(localPath);
      continue;
    }

    rewritten.push(rawLine);
  }

  if (segmentIndex === 0) {
    throw new Error("HLS playlist contains no media segments");
  }

  return {
    manifest: `${rewritten.join("\n").replace(/\n+$/, "")}\n`,
    resources,
    segmentCount: segmentIndex,
    durationSeconds,
  };
}

function isRejectedHlsContentType(contentType, { allowPlaylist = false } = {}) {
  const normalized = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const isPlaylistType =
    normalized.includes("mpegurl") || normalized.includes("m3u8");
  if (allowPlaylist && isPlaylistType) return false;
  return (
    normalized.startsWith("text/") ||
    normalized.includes("json") ||
    normalized.includes("xml") ||
    isPlaylistType
  );
}

module.exports = {
  HLS_LIMITS,
  isHlsUrl,
  isRejectedHlsContentType,
  parseHlsMediaPlaylist,
};

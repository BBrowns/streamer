import type { Stream } from "@streamer/shared";

const ALLOWED_TRACKER_PROTOCOLS = new Set([
  "http:",
  "https:",
  "udp:",
  "ws:",
  "wss:",
]);

function normalizeInfoHash(infoHash: string | undefined) {
  const normalized = infoHash?.trim();
  return normalized && /^(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(normalized)
    ? normalized.toLowerCase()
    : null;
}

function isPrivateOrReservedTrackerHost(hostname: string) {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }

  const octets = host.split(".").map(Number);
  if (
    octets.length === 4 &&
    octets.every(
      (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255,
    )
  ) {
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }

  if (host.includes(":")) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:") ||
      host.startsWith("ff")
    );
  }

  return false;
}

function isSafeTrackerHint(value: string) {
  try {
    const parsed = new URL(value);
    return (
      ALLOWED_TRACKER_PROTOCOLS.has(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      parsed.hostname.length > 0 &&
      !isPrivateOrReservedTrackerHost(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/** Build a runtime-only magnet without persisting or logging source details. */
export function buildRuntimeTorrentMagnet(
  stream: Pick<Stream, "infoHash" | "url">,
) {
  const normalized = normalizeInfoHash(stream.infoHash);
  if (!normalized) return null;

  if (stream.url?.trim().toLowerCase().startsWith("magnet:?")) {
    try {
      const source = new URL(stream.url.trim());
      const matchingIdentity = source.searchParams
        .getAll("xt")
        .map((value) => value.replace(/^urn:btih:/i, "").toLowerCase())
        .some((value) => value === normalized);
      const trackerHints = source.searchParams
        .getAll("tr")
        .filter(isSafeTrackerHint);

      if (matchingIdentity && trackerHints.length > 0) {
        return `magnet:?${[
          `xt=${encodeURIComponent(`urn:btih:${normalized}`)}`,
          ...trackerHints.map((tracker) => `tr=${encodeURIComponent(tracker)}`),
        ].join("&")}`;
      }
    } catch {
      // Fall through to the identity-only form.
    }
  }

  return `magnet:?xt=urn:btih:${normalized}`;
}

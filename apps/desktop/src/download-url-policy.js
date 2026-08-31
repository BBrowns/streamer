"use strict";

const net = require("node:net");
const { lookup: defaultDnsLookup } = require("node:dns/promises");

const MAX_DIRECT_DOWNLOAD_BYTES = 20 * 1024 * 1024 * 1024;
const PRIVATE_IPV6_RANGES = new net.BlockList();
PRIVATE_IPV6_RANGES.addSubnet("fe80::", 10, "ipv6");
PRIVATE_IPV6_RANGES.addSubnet("fc00::", 7, "ipv6");
PRIVATE_IPV6_RANGES.addSubnet("ff00::", 8, "ipv6");

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
}

function ipv4FromMappedIpv6(host) {
  const dottedMatch = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (dottedMatch) return dottedMatch[1];

  const hexMatch = host.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hexMatch) return null;
  const high = Number.parseInt(hexMatch[1], 16);
  const low = Number.parseInt(hexMatch[2], 16);
  if (Number.isNaN(high) || Number.isNaN(low)) return null;
  return [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255].join(".");
}

function isPrivateOrReservedIpv4(host) {
  const parts = host.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && b === 51) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isPrivateOrReservedIpv6(host) {
  const normalized = normalizeHostname(host);
  const mappedIpv4 = ipv4FromMappedIpv6(normalized);
  if (mappedIpv4) return isPrivateOrReservedIpv4(mappedIpv4);

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("2001:db8:") ||
    PRIVATE_IPV6_RANGES.check(normalized, "ipv6")
  );
}

function isPublicAddress(address, family) {
  const version = family || net.isIP(address);
  if (version === 4) return !isPrivateOrReservedIpv4(address);
  if (version === 6) return !isPrivateOrReservedIpv6(address);
  return false;
}

function isOwnedBridgeStreamUrl(parsed) {
  const hostname = normalizeHostname(parsed.hostname);
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  const signedParams =
    parsed.searchParams.size === 2 &&
    parsed.searchParams.has("expires") &&
    parsed.searchParams.has("signature");

  return Boolean(
    parsed.protocol === "http:" &&
    loopback &&
    parsed.port === "11470" &&
    /^\/api\/(?:bridge\/v1|gateway)\/jobs\/[0-9a-f-]+\/stream$/i.test(
      parsed.pathname,
    ) &&
    signedParams,
  );
}

function parseDownloadUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Download source is invalid");
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("Download source is invalid");
  }
  if (isOwnedBridgeStreamUrl(parsed)) {
    return { kind: "bridge", parsed };
  }
  if (parsed.protocol !== "https:") {
    throw new Error("External downloads must use HTTPS");
  }
  return { kind: "public-https", parsed };
}

async function validateDownloadUrlWithDns(rawUrl, lookup = defaultDnsLookup) {
  const { kind, parsed } = parseDownloadUrl(rawUrl);
  if (kind === "bridge") {
    return { kind, parsed, addresses: [] };
  }

  const hostname = normalizeHostname(parsed.hostname);
  const ipVersion = net.isIP(hostname);
  const addresses = ipVersion
    ? [{ address: hostname, family: ipVersion }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (
    !Array.isArray(addresses) ||
    addresses.length === 0 ||
    addresses.some(({ address, family }) => !isPublicAddress(address, family))
  ) {
    throw new Error(
      "Download source resolves to a private or reserved address",
    );
  }

  return { kind, parsed, addresses };
}

function createPinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    const requestedFamily =
      typeof options === "number" ? options : Number(options?.family || 0);
    const candidates = requestedFamily
      ? addresses.filter(({ family }) => family === requestedFamily)
      : addresses;
    const selected = candidates[0];
    if (!selected) {
      const error = new Error(
        "No validated address matches the request family",
      );
      error.code = "ENOTFOUND";
      callback(error);
      return;
    }
    if (typeof options === "object" && options?.all) {
      callback(null, candidates);
      return;
    }
    callback(null, selected.address, selected.family);
  };
}

module.exports = {
  createPinnedLookup,
  isOwnedBridgeStreamUrl,
  MAX_DIRECT_DOWNLOAD_BYTES,
  validateDownloadUrlWithDns,
};

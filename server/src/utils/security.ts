import dns from "dns/promises";
import net from "net";

export interface SafeUrlValidationOptions {
  allowHttp?: boolean;
  allowPrivateNetworks?: boolean;
}

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "metadata.google.internal",
]);

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase();
}

function isPrivateOrReservedIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
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
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224
  );
}

function ipv4FromMappedIpv6(ip: string) {
  const dottedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (dottedMatch) return dottedMatch[1];

  const hexMatch = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hexMatch) return null;

  const high = Number.parseInt(hexMatch[1], 16);
  const low = Number.parseInt(hexMatch[2], 16);
  if (Number.isNaN(high) || Number.isNaN(low)) return null;

  return [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255].join(".");
}

function isPrivateOrReservedIpv6(ip: string) {
  const mappedIpv4 = ipv4FromMappedIpv6(ip);
  if (mappedIpv4) return isPrivateOrReservedIpv4(mappedIpv4);

  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fe80:") ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("ff")
  );
}

function isPrivateOrReservedIp(ip: string) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateOrReservedIpv4(ip);
  if (version === 6) return isPrivateOrReservedIpv6(ip);
  return false;
}

function allowPrivateNetworksFromEnvironment() {
  return ["1", "true", "yes", "on"].includes(
    (process.env.ADDON_ALLOW_PRIVATE_NETWORKS || "").toLowerCase(),
  );
}

/** Validates that a given URL resolves to a safe, public IP to prevent SSRF */
export async function validateSafeUrl(
  urlString: string,
  options: SafeUrlValidationOptions = {},
): Promise<void> {
  const parsedUrl = new URL(urlString);

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("URL credentials are not allowed");
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.protocol !== "http:" &&
    !options.allowHttp
  ) {
    throw new Error(
      `Insecure protocol: ${parsedUrl.protocol}. HTTPS required.`,
    );
  }

  const hostname = normalizeHostname(parsedUrl.hostname);
  const allowPrivateNetworks =
    options.allowPrivateNetworks || allowPrivateNetworksFromEnvironment();
  const httpRequiresPrivateTarget =
    parsedUrl.protocol === "http:" && !options.allowHttp;

  if (httpRequiresPrivateTarget && !allowPrivateNetworks) {
    throw new Error(
      `Insecure protocol: ${parsedUrl.protocol}. HTTPS required.`,
    );
  }

  if (
    !allowPrivateNetworks &&
    (LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost"))
  ) {
    throw new Error("SSRF Blocked: Target resolves to local hostname");
  }

  if (
    allowPrivateNetworks &&
    (LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost"))
  ) {
    return;
  }

  const addresses: string[] = [];
  if (net.isIP(hostname)) {
    addresses.push(hostname);
  } else {
    try {
      const lookups = await dns.lookup(hostname, {
        all: true,
        verbatim: true,
      });
      addresses.push(...lookups.map((lookup) => lookup.address));
    } catch (err) {
      throw new Error(`DNS resolution failed for hostname: ${hostname}`);
    }
  }

  if (addresses.length === 0) {
    throw new Error(`DNS resolution failed for hostname: ${hostname}`);
  }

  const privateOrReservedAddresses = addresses.filter(isPrivateOrReservedIp);

  if (httpRequiresPrivateTarget && privateOrReservedAddresses.length === 0) {
    throw new Error(
      `Insecure protocol: ${parsedUrl.protocol}. HTTPS required.`,
    );
  }

  if (!allowPrivateNetworks) {
    for (const address of privateOrReservedAddresses) {
      throw new Error(
        `SSRF Blocked: Target resolves to internal IP ${address}`,
      );
    }
  }
}

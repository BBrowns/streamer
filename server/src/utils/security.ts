import dns from "dns/promises";
import net from "net";

/** Validates that a given URL resolves to a safe, public IP to prevent SSRF */
export async function validateSafeUrl(urlString: string): Promise<void> {
  const parsedUrl = new URL(urlString);

  // Allow HTTP and localhost in development/test environments
  const isDevOrTest =
    process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development";

  if (parsedUrl.protocol !== "https:" && !isDevOrTest) {
    throw new Error(
      `Insecure protocol: ${parsedUrl.protocol}. HTTPS required.`,
    );
  }

  let ip = parsedUrl.hostname;
  if (!net.isIP(ip)) {
    try {
      const lookup = await dns.lookup(parsedUrl.hostname);
      ip = lookup.address;
    } catch (err) {
      throw new Error(
        `DNS resolution failed for hostname: ${parsedUrl.hostname}`,
      );
    }
  }

  if (isDevOrTest) return; // Skip IP blocklist in dev/test

  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (
      parts[0] === 10 || // 10.0.0.0/8
      parts[0] === 127 || // 127.0.0.0/8
      (parts[0] === 192 && parts[1] === 168) || // 192.168.0.0/16
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
      (parts[0] === 169 && parts[1] === 254) || // 169.254.0.0/16
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // 100.64.0.0/10
      parts[0] === 0 // 0.0.0.0/8
    ) {
      throw new Error(`SSRF Blocked: Target resolves to internal IP ${ip}`);
    }
  } else if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      lower === "::" // Unspecified
    ) {
      throw new Error(`SSRF Blocked: Target resolves to internal IPv6 address`);
    }
  }
}

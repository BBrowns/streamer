import axios, { type AxiosRequestConfig } from "axios";
import { env } from "../../config/env.js";
import { validateSafeUrl } from "../../utils/security.js";

export type AddonFetchKind = "manifest" | "resource";
export type AddonSourcePolicyCode =
  | "unsafe-url"
  | "too-many-redirects"
  | "missing-redirect-location"
  | "oversized-response";

export interface FetchSafeAddonJsonOptions {
  kind: AddonFetchKind;
  timeoutMs?: number;
  /** May lower, but never raise, the default body limit for this request. */
  maxResponseBytes?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
  axiosOptions?: Pick<AxiosRequestConfig, "httpAgent" | "httpsAgent">;
}

const DEFAULT_MAX_REDIRECTS = 3;
const ADDON_RESPONSE_LIMIT_BYTES: Record<AddonFetchKind, number> = {
  manifest: 256 * 1024,
  resource: 1024 * 1024,
};

export class AddonSourcePolicyError extends Error {
  constructor(
    public readonly code: AddonSourcePolicyCode,
    message: string,
  ) {
    super(message);
    this.name = "AddonSourcePolicyError";
  }
}

export function isRedirectStatus(status: number) {
  return [301, 302, 303, 307, 308].includes(status);
}

export function safeUrlForLog(urlString: string) {
  try {
    const parsed = new URL(urlString);
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
    };
  } catch {
    return { invalid: true };
  }
}

function getPayloadSizeBytes(data: unknown) {
  if (typeof data === "string") return Buffer.byteLength(data, "utf8");
  if (data === undefined || data === null) return 0;
  return Buffer.byteLength(JSON.stringify(data), "utf8");
}

function resolveResponseLimit(options: FetchSafeAddonJsonOptions) {
  const defaultLimit = ADDON_RESPONSE_LIMIT_BYTES[options.kind];
  if (options.maxResponseBytes === undefined) return defaultLimit;
  if (!Number.isSafeInteger(options.maxResponseBytes)) return defaultLimit;
  return Math.max(1, Math.min(defaultLimit, options.maxResponseBytes));
}

function assertPayloadSize(
  data: unknown,
  kind: AddonFetchKind,
  maxBytes: number,
) {
  const sizeBytes = getPayloadSizeBytes(data);
  if (sizeBytes > maxBytes) {
    throw new AddonSourcePolicyError(
      "oversized-response",
      `Add-on ${kind} response exceeded ${maxBytes} bytes.`,
    );
  }
}

async function assertSafeAddonUrl(url: string) {
  try {
    await validateSafeUrl(url);
  } catch (error) {
    throw new AddonSourcePolicyError(
      "unsafe-url",
      error instanceof Error ? error.message : "Unsafe add-on URL",
    );
  }
}

export async function fetchSafeAddonJson(
  url: string,
  options: FetchSafeAddonJsonOptions,
  redirects = 0,
): Promise<unknown> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  if (redirects > maxRedirects) {
    throw new AddonSourcePolicyError(
      "too-many-redirects",
      "Too many add-on redirects.",
    );
  }

  await assertSafeAddonUrl(url);

  const maxBytes = resolveResponseLimit(options);
  let response;
  try {
    response = await axios.get(url, {
      timeout: options.timeoutMs ?? env.addonTimeoutMs,
      signal: options.signal,
      maxRedirects: 0,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      ...options.axiosOptions,
      validateStatus: (status) =>
        (status >= 200 && status < 300) || isRedirectStatus(status),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/maxContentLength|maxBodyLength|content length/i.test(message)) {
      throw new AddonSourcePolicyError(
        "oversized-response",
        `Add-on ${options.kind} response exceeded ${maxBytes} bytes.`,
      );
    }
    throw error;
  }

  if (isRedirectStatus(response.status)) {
    const location = response.headers.location;
    if (typeof location !== "string" || location.trim().length === 0) {
      throw new AddonSourcePolicyError(
        "missing-redirect-location",
        "Add-on redirect missing Location header.",
      );
    }

    return fetchSafeAddonJson(
      new URL(location, url).toString(),
      options,
      redirects + 1,
    );
  }

  assertPayloadSize(response.data, options.kind, maxBytes);
  return response.data;
}

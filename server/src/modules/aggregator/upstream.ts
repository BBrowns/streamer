import https from "https";
import { logger } from "../../config/logger.js";
import { NonRetryableUpstreamError, resilienceRegistry } from "./resilience.js";
import { fetchSafeAddonJson, safeUrlForLog } from "../addon/addon-fetcher.js";
import { z } from "zod";
import {
  getUpstreamStatus,
  isExplicitMetadataNotFound,
} from "./upstream-status.js";

export const secureAgent = new https.Agent({
  maxSockets: 50,
  keepAlive: true,
});

export function buildCatalogPath(
  type: string,
  catalogId: string,
  search?: string,
  skip?: number,
): string {
  const extras: string[] = [];
  if (search) extras.push(`search=${encodeURIComponent(search)}`);
  if (skip && skip > 0) extras.push(`skip=${skip}`);

  const extraPath = extras.length > 0 ? `/${extras.join("&")}` : "";
  return `catalog/${type}/${catalogId}${extraPath}.json`;
}

/**
 * Resilience state must be scoped to the installed add-on, not to the
 * provider-controlled manifest id. Hashing the tenant, row id and origin keeps
 * metrics opaque while preventing one installation from poisoning another.
 */
export function buildAddonPolicyKey(
  userId: string,
  installedAddonId: string,
  transportUrl: string,
): string {
  let origin = transportUrl;
  try {
    origin = new URL(transportUrl).origin;
  } catch {
    // Installed transports are URL-validated. Keep a deterministic fallback
    // for old/corrupt rows so the policy key still remains tenant-scoped.
  }
  const input = `${userId}\u0000${installedAddonId}\u0000${origin}`;
  const bytes = new TextEncoder().encode(input);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `addon:${installedAddonId}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** Resilient fetch wrapper for add-on requests with strict Zod validation */
export async function resilientFetch<T>(
  transportUrl: string,
  addonPolicyKey: string,
  resourcePath: string,
  requestId: string,
  schema: z.ZodSchema<T>,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
    callerSignal?: AbortSignal;
    nonRetryableClientErrors?: boolean;
    maxResponseBytes?: number;
    preparePayload?: (value: unknown) => unknown;
  } = {},
): Promise<T> {
  const policy = resilienceRegistry.getPolicy(addonPolicyKey);

  const base = transportUrl
    .replace(/\/manifest\.json\/?$/, "")
    .replace(/\/$/, "");
  const url = `${base}/${resourcePath}`;

  const start = Date.now();

  try {
    const result = await policy.execute(async () => {
      logger.debug(
        { requestId, addonPolicyKey, target: safeUrlForLog(url) },
        "Fetching from add-on",
      );

      let data: unknown;
      try {
        data = await fetchSafeAddonJson(url, {
          kind: "resource",
          timeoutMs: options.timeoutMs,
          maxResponseBytes: options.maxResponseBytes,
          signal: options.signal,
          axiosOptions: { httpsAgent: secureAgent },
        });
      } catch (error) {
        // A caller navigating away is not evidence that the provider failed.
        // Mark it non-retryable before resilience policies observe it so a
        // superseded query cannot open the provider circuit.
        if (options.callerSignal?.aborted) {
          throw new NonRetryableUpstreamError(
            "Search request cancelled.",
            error,
          );
        }
        const upstreamStatus = getUpstreamStatus(error);
        if (upstreamStatus === 403) {
          throw new NonRetryableUpstreamError("Provider access denied.", error);
        }
        if (
          options.nonRetryableClientErrors &&
          upstreamStatus !== undefined &&
          upstreamStatus >= 400 &&
          upstreamStatus < 500
        ) {
          throw new NonRetryableUpstreamError(
            "Search request was rejected upstream.",
            error,
          );
        }
        // A missing title is a valid metadata lookup outcome, not a provider
        // outage. Mark it before the retry/breaker policies observe it while
        // retaining the original status for getMeta's final classification.
        if (
          resourcePath.startsWith("meta/") &&
          isExplicitMetadataNotFound(error)
        ) {
          throw new NonRetryableUpstreamError(
            "Metadata not found upstream.",
            error,
          );
        }
        throw error;
      }

      // Strict Sanitation: Search can additionally discard unknown/heavy
      // fields and bound collections before Zod walks every retained item.
      const prepared = options.preparePayload
        ? options.preparePayload(data)
        : data;
      const parsed = schema.safeParse(prepared);
      if (!parsed.success) {
        logger.error(
          { requestId, addonPolicyKey, errors: parsed.error.format() },
          "Add-on response failed validation",
        );
        throw new Error("Invalid response format from add-on");
      }

      return parsed.data;
    }, options.signal);

    logger.info(
      { requestId, addonPolicyKey, latencyMs: Date.now() - start },
      "Add-on fetch success",
    );

    return result;
  } catch (err: any) {
    logger.warn(
      {
        requestId,
        addonPolicyKey,
        latencyMs: Date.now() - start,
        target: safeUrlForLog(url),
        error: err.message,
      },
      "Add-on fetch failed",
    );
    throw err;
  }
}

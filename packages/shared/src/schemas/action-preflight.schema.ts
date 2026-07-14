import { z } from "zod";

export const actionEndpointScopeSchema = z.enum([
  "loopback",
  "lan",
  "remote",
  "invalid",
  "unknown",
]);

export const actionPreflightReasonSchema = z.enum([
  "ready",
  "source_unsupported",
  "hls_offline_unsupported",
  "cast_source_loopback",
  "cast_source_unreachable",
  "bridge_not_configured",
  "bridge_checking",
  "bridge_url_invalid",
  "bridge_loopback_unreachable",
  "bridge_unreachable",
  "bridge_auth_required",
  "bridge_runtime_unsupported",
  "gateway_unavailable",
  "torrent_engine_unavailable",
  "remux_unavailable",
  "cast_service_unavailable",
]);

export const actionBridgeAuthSnapshotSchema = z
  .object({
    required: z.boolean().optional(),
    bridgeConfigured: z.boolean().optional(),
    clientConfigured: z.boolean().optional(),
  })
  .strict();

export const actionBridgeCapabilitiesSchema = z
  .object({
    gateway: z.boolean().optional(),
    torrent: z.boolean().optional(),
    remux: z.boolean().optional(),
    cast: z.boolean().optional(),
  })
  .strict();

export const actionBridgeEndpointSnapshotSchema = z
  .object({
    scope: actionEndpointScopeSchema,
    deviceReachable: z.boolean().optional(),
    castReachable: z.boolean().optional(),
  })
  .strict();

export const actionPreflightResultSchema = z
  .object({
    action: z.enum(["play", "download", "cast"]),
    ready: z.boolean(),
    reason: actionPreflightReasonSchema,
    message: z.string().min(1),
    requiresBridge: z.boolean(),
    retryable: z.boolean(),
  })
  .strict();

/** Cross-boundary safety budgets. Keep consumers on these defaults unless a
 * product-specific limit is intentionally stricter. */
export const SECURITY_LIMITS = {
  directDownloadBytes: 20 * 1024 * 1024 * 1024,
  bulkResolveItems: 16,
  bulkResolveConcurrency: 4,
  syncWebSocketPayloadBytes: 64 * 1024,
  syncWebSocketConnectionsPerUser: 8,
  syncWebSocketMessagesPerMinute: 100,
  syncWebSocketIdleMs: 5 * 60 * 1000,
  realDebridResolutionsPerMinute: 32,
  boundedMapEntries: 10_000,
} as const;

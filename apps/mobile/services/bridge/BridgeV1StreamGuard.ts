import type { BridgeJobV1 } from "@streamer/shared";

const BRIDGE_V1_OPAQUE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class BridgeV1StreamBindingError extends Error {
  constructor() {
    super("The bridge returned an invalid stream path.");
    this.name = "BridgeV1StreamBindingError";
  }
}

export function isBridgeV1OpaqueId(value: string): boolean {
  return BRIDGE_V1_OPAQUE_ID_PATTERN.test(value);
}

/**
 * Bind a protocol-v1 relative stream path to its already-approved bridge
 * origin. The returned signed URL is runtime-only and must not be persisted,
 * logged, cached outside the active source lease, or copied into telemetry.
 */
export function bindBridgeV1StreamUri(options: {
  baseOrigin: string;
  job: BridgeJobV1;
  now?: number;
}): string {
  const { job } = options;
  const stream = job.stream;
  if (
    !isBridgeV1OpaqueId(job.id) ||
    !stream?.path ||
    !stream.path.startsWith("/") ||
    stream.path.startsWith("//")
  ) {
    throw new BridgeV1StreamBindingError();
  }

  let approvedOrigin: string;
  let resolved: URL;
  try {
    const configured = new URL(options.baseOrigin);
    if (
      configured.username ||
      configured.password ||
      configured.origin !== options.baseOrigin
    ) {
      throw new BridgeV1StreamBindingError();
    }
    approvedOrigin = configured.origin;
    resolved = new URL(stream.path, `${approvedOrigin}/`);
  } catch (error) {
    if (error instanceof BridgeV1StreamBindingError) throw error;
    throw new BridgeV1StreamBindingError();
  }

  const expectedPath = `/api/bridge/v1/jobs/${encodeURIComponent(job.id)}/stream`;
  const expiresValues = resolved.searchParams.getAll("expires");
  const signatureValues = resolved.searchParams.getAll("signature");
  const queryKeys = Array.from(resolved.searchParams.keys());
  const expires = Number(expiresValues[0]);
  const expiresAt = Date.parse(stream.expiresAt);
  if (
    resolved.origin !== approvedOrigin ||
    resolved.username ||
    resolved.password ||
    resolved.pathname !== expectedPath ||
    resolved.hash ||
    queryKeys.length !== 2 ||
    !queryKeys.every((key) => key === "expires" || key === "signature") ||
    expiresValues.length !== 1 ||
    signatureValues.length !== 1 ||
    !signatureValues[0] ||
    !Number.isSafeInteger(expires) ||
    expires <= 0 ||
    !Number.isFinite(expiresAt) ||
    expires !== expiresAt ||
    expiresAt <= (options.now ?? Date.now())
  ) {
    throw new BridgeV1StreamBindingError();
  }

  return resolved.toString();
}

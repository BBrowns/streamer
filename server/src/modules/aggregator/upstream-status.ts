/** Extract transport status without interpreting or exposing raw error text. */
export function getUpstreamStatus(error: unknown): number | undefined {
  let candidate: unknown = error;

  // Resilience/transport libraries may retain the original failure as a cause.
  // Bound traversal (including cyclic causes); never return the cause itself.
  for (let depth = 0; depth < 3; depth += 1) {
    if (!candidate || typeof candidate !== "object") return undefined;
    const current = candidate as {
      status?: unknown;
      response?: { status?: unknown };
      cause?: unknown;
    };
    const status = current.response?.status ?? current.status;
    if (typeof status === "number") return status;
    candidate = current.cause;
  }

  return undefined;
}

export function isExplicitMetadataNotFound(error: unknown) {
  return getUpstreamStatus(error) === 404;
}

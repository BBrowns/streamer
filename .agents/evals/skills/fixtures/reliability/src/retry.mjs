export async function runWithRetries(
  operation,
  { maxAttempts = 1, signal } = {},
) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return operation(1);
}

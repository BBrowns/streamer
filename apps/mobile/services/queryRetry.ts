import { isAuthRefreshError } from "./api";
import { isRateLimitError } from "./rateLimit";

const MAX_QUERY_RETRIES = 3;

export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (isRateLimitError(error) || isAuthRefreshError(error)) return false;
  return failureCount < MAX_QUERY_RETRIES;
}

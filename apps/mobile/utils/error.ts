import { AxiosError } from "axios";

/**
 * Extracts a user-friendly error message from an API error response.
 * Specifically handles the Hono/Zod error structure used in the Streamer backend.
 */
export function extractErrorMessage(error: any): string {
  if (!error) return "An unexpected error occurred";

  // Handle Axios errors
  if (error instanceof AxiosError || (error.isAxiosError && error.response)) {
    const data = error.response?.data;

    // Check for specific Zod validation details
    if (
      data?.details &&
      Array.isArray(data.details) &&
      data.details.length > 0
    ) {
      // Return the first validation message (e.g., "Password must be at least 8 characters")
      return data.details[0].message || data.error || "Validation failed";
    }

    // Fallback to the main error string if available
    if (typeof data?.error === "string") {
      return data.error;
    }

    // Handle generic server error messages
    if (typeof data?.message === "string") {
      return data.message;
    }
  }

  // Handle standard JS errors
  if (error instanceof Error) {
    return error.message;
  }

  // Handle string errors
  if (typeof error === "string") {
    return error;
  }

  return "Something went wrong. Please try again.";
}

import { SourcePreparationError } from "../types";

export function requireHttpMediaUrl(rawUrl: string | undefined): string {
  if (!rawUrl?.trim()) {
    throw new SourcePreparationError(
      "INVALID_SOURCE",
      "The selected source does not contain a media URL.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SourcePreparationError(
      "INVALID_SOURCE",
      "The selected source contains an invalid media URL.",
    );
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password
  ) {
    throw new SourcePreparationError(
      "INVALID_SOURCE",
      "The selected source uses an unsupported media URL.",
    );
  }

  return parsed.toString();
}

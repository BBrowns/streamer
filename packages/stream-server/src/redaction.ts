const REDACTED_URL = "[url]";

export function redactSensitiveText(text: string) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/magnet:\?[^\s"'<>]+/gi, "[magnet]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => {
      if (
        /[?&](token|access_token|refresh_token|signature|auth|authorization|key|api_key)=/i.test(
          match,
        ) ||
        /\/api\/gateway\/jobs\/[^/]+\/stream/i.test(match)
      ) {
        try {
          const parsed = new URL(match);
          if (
            parsed.pathname.includes("/api/gateway/jobs/") &&
            parsed.pathname.endsWith("/stream")
          ) {
            parsed.pathname = "/api/gateway/jobs/[job]/stream";
            parsed.search = parsed.search ? "?[signed]" : "";
            return parsed.toString();
          }
        } catch {
          return REDACTED_URL;
        }
      }
      return REDACTED_URL;
    })
    .replace(
      /([?&](?:token|access_token|refresh_token|signature|auth|authorization|key|api_key)=)[^&\s]+/gi,
      "$1[redacted]",
    );
}

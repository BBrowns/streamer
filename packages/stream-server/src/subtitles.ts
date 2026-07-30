import type { Request, Response } from "express";

/**
 * Compatibility tombstone for the pre-job subtitle API.
 *
 * The retired routes accepted raw magnets, selected the largest torrent file,
 * exposed reusable stream URLs, and ran work outside the gateway job
 * lifecycle. Keeping an explicit 410 response makes older clients fail closed
 * while pointing maintained clients at the authenticated, exact-file,
 * cancellable gateway contract.
 */
export function legacySubtitlesRetiredRequest(_req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  return res.status(410).json({
    error: "Legacy subtitle endpoint retired",
    code: "LEGACY_SUBTITLE_ENDPOINT_RETIRED",
    replacement: "/api/gateway/jobs/:id/subtitles/:identity",
  });
}

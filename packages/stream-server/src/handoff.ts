import { Router, Request, Response } from "express";
import { requireBridgeAuth } from "./security.js";

const router = Router();
router.use(requireBridgeAuth);

/**
 * Handoff API
 * Allows other devices to "push" a stream to this desktop instance.
 */
export function legacyHandoffRequest(req: Request, res: Response) {
  const magnet = req.body?.magnet;

  if (typeof magnet !== "string" || !magnet.startsWith("magnet:?")) {
    return res.status(400).json({ error: "Magnet link is required" });
  }

  // The historical endpoint claimed success without a reliable transport to
  // Electron and could place the raw magnet in renderer navigation. Retire it
  // fail-closed until an opaque bridge-job handoff contract is available.
  return res.status(410).json({
    protocolVersion: 1,
    error: {
      code: "PROTOCOL_UNSUPPORTED",
      message:
        "Legacy playback handoff is retired. Create a bridge v1 job instead.",
      retryable: false,
    },
  });
}

router.post("/", legacyHandoffRequest);

export const handoffRouter = router;

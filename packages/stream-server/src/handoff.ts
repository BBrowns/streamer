import { Router, Request, Response } from "express";
import { redactSensitiveText } from "./redaction.js";
import { requireBridgeAuth } from "./security.js";

const router = Router();
router.use(requireBridgeAuth);

/**
 * Handoff API
 * Allows other devices to "push" a stream to this desktop instance.
 */
router.post("/", async (req: Request, res: Response) => {
  const { magnet, position, title, itemId } = req.body;

  if (!magnet) {
    return res.status(400).json({ error: "Magnet link is required" });
  }

  console.log(
    `[handoff] Received stream request${title ? ` for: ${title}` : ""}`,
  );

  try {
    // We attempt to communicate with the Electron main process if available
    // Since stream-server might be running inside Electron or standalone
    try {
      const electron = await import("electron");
      if (electron && electron.ipcMain) {
        // We use a custom event to notify the Electron shell
        // The shell will then forward this to the renderer
        electron.ipcMain.emit("handoff-play", null, {
          magnet,
          position,
          title,
          itemId,
        });
      }
    } catch (e) {
      console.warn("[handoff] Electron not found, handoff UI trigger skipped");
    }

    res.json({ success: true, message: "Handoff received" });
  } catch (err: any) {
    res
      .status(500)
      .json({ error: redactSensitiveText(err?.message ?? "Handoff failed") });
  }
});

export const handoffRouter = router;

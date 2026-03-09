import { Hono } from "hono";
import { aggregatorController } from "./aggregator.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";

export const aggregatorRouter = new Hono();

// All aggregator routes require authentication
aggregatorRouter.use("*", authMiddleware);

aggregatorRouter.get("/search", (c) => aggregatorController.search(c));
aggregatorRouter.get("/catalog/:type", (c) =>
  aggregatorController.getCatalog(c),
);
aggregatorRouter.get("/meta/:type/:id", (c) => aggregatorController.getMeta(c));
aggregatorRouter.get("/stream/:type/:id", (c) =>
  aggregatorController.getStreams(c),
);
aggregatorRouter.get("/stream/resolve/:type/:id/:infoHash", (c) =>
  aggregatorController.resolveStream(c),
);
// Bulk resolve: POST /stream/resolve-bulk { type, infoHashes: string[] }
aggregatorRouter.post("/stream/resolve-bulk", (c) =>
  aggregatorController.resolveStreamsBulk(c),
);

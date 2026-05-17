import { apiReference } from "@scalar/hono-api-reference";
import { systemRouter } from "../system/system.routes.js";

export const docsRouter = systemRouter;

docsRouter.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Streamer API",
    description: "API for the Streamer cross-platform application",
  },
  servers: [
    {
      url: "http://localhost:3001",
      description: "Local development",
    },
  ],
});

docsRouter.get(
  "/reference",
  apiReference({
    spec: {
      url: "/api/docs/openapi.json",
    },
    theme: "purple" as any,
  }),
);

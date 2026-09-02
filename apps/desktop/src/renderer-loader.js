"use strict";

const path = require("path");

const DEFAULT_RENDERER_URL = "http://localhost:8081";

/**
 * Resolve the renderer without allowing a packaged build to silently depend
 * on a developer's Metro server. The caller still validates dev URLs through
 * the desktop security allowlist before loading them.
 */
function resolveRendererTarget(options = {}) {
  const rendererRoot = options.rendererRoot || path.join(__dirname, "renderer");
  const rendererUrl = options.rendererUrl || DEFAULT_RENDERER_URL;

  if (!options.isPackaged || options.allowDevRenderer) {
    return { kind: "dev-url", url: rendererUrl };
  }

  return {
    kind: "packaged-file",
    path: path.join(rendererRoot, "index.html"),
  };
}

module.exports = {
  DEFAULT_RENDERER_URL,
  resolveRendererTarget,
};

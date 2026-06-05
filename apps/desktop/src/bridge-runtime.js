"use strict";

const path = require("path");

function uniqueTruthy(values) {
  return [...new Set(values.filter(Boolean))];
}

function isInsidePath(value, root) {
  if (!value || !root) return false;
  const relative = path.relative(root, value);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function resolveBridgeEntrypointPath(options = {}) {
  const {
    dirname = __dirname,
    env = process.env,
    exists = () => false,
    resourcesPath = process.resourcesPath,
  } = options;

  const candidates = uniqueTruthy([
    env.STREAMER_BRIDGE_ENTRYPOINT,
    resourcesPath
      ? path.resolve(resourcesPath, "stream-server/index.js")
      : null,
    resourcesPath
      ? path.resolve(resourcesPath, "app.asar.unpacked/stream-server/index.js")
      : null,
    path.resolve(dirname, "../../../packages/stream-server/dist/index.js"),
    path.resolve(dirname, "../../packages/stream-server/dist/index.js"),
  ]);

  return candidates.find((candidate) => exists(candidate)) || candidates[0];
}

function resolveNodeDataChannelBinaryPath(options = {}) {
  const {
    dirname = __dirname,
    exists = () => false,
    resourcesPath = process.resourcesPath,
  } = options;

  const candidates = uniqueTruthy([
    resourcesPath
      ? path.resolve(
          resourcesPath,
          "node_modules/node-datachannel/build/Release/node_datachannel.node",
        )
      : null,
    resourcesPath
      ? path.resolve(
          resourcesPath,
          "app.asar.unpacked/node_modules/node-datachannel/build/Release/node_datachannel.node",
        )
      : null,
    path.resolve(
      dirname,
      "../../../node_modules/node-datachannel/build/Release/node_datachannel.node",
    ),
    path.resolve(
      dirname,
      "../../node_modules/node-datachannel/build/Release/node_datachannel.node",
    ),
  ]);

  return candidates.find((candidate) => exists(candidate)) || null;
}

function resolveNodeBinaryCandidatePaths(options = {}) {
  const {
    dirname = __dirname,
    env = process.env,
    exists = () => false,
    homeDir = "",
    isPackaged = false,
    pathEnv = env.PATH || "",
    platform = process.platform,
    readdir = () => [],
    resourcesPath = process.resourcesPath,
  } = options;

  const executableName = platform === "win32" ? "node.exe" : "node";
  const pathCandidates = [];
  for (const searchPath of pathEnv.split(path.delimiter)) {
    if (!searchPath) continue;
    pathCandidates.push(path.join(searchPath, executableName));
  }

  const managerCandidates = [];
  if (platform === "darwin" || platform === "linux") {
    managerCandidates.push(
      path.join(homeDir, ".nvm/versions/node/*/bin/node"),
      path.join(homeDir, ".asdf/installs/node/*/bin/node"),
      platform === "darwin"
        ? path.join(
            homeDir,
            "Library/Application Support/fnm/node-versions/*/installation/bin/node",
          )
        : path.join(
            homeDir,
            ".local/share/fnm/node-versions/*/installation/bin/node",
          ),
    );
  }

  const devVendorBase = path.resolve(dirname, "../vendor/node");
  const resourceBase = resourcesPath
    ? path.resolve(resourcesPath, "node")
    : null;
  const resourceCandidates = [];
  const devVendorCandidates = [];

  for (const arch of ["arm64", "x64"]) {
    if (resourceBase) {
      resourceCandidates.push(
        path.join(resourceBase, `${platform}-${arch}/bin/node`),
      );
    }
    devVendorCandidates.push(
      path.join(devVendorBase, `${platform}-${arch}/bin/node`),
    );
  }

  const expandedManagerCandidates = [];
  if (!isPackaged) {
    for (const pattern of managerCandidates) {
      try {
        if (pattern.includes("*")) {
          const parts = pattern.split("*");
          const dir = parts[0];
          if (exists(dir)) {
            for (const subdir of readdir(dir)) {
              const candidate = path.join(dir, subdir, parts[1]);
              if (exists(candidate)) expandedManagerCandidates.push(candidate);
            }
          }
        } else if (exists(pattern)) {
          expandedManagerCandidates.push(pattern);
        }
      } catch {
        /* Ignore candidate expansion failures. */
      }
    }
  }

  const allowSystemNode =
    !isPackaged || env.STREAMER_BRIDGE_ALLOW_SYSTEM_NODE === "1";
  const explicitOverride = env.STREAMER_BRIDGE_NODE;

  return uniqueTruthy([
    ...resourceCandidates,
    ...(isPackaged ? [] : devVendorCandidates),
    ...(isPackaged && !allowSystemNode ? [] : [explicitOverride]),
    ...(allowSystemNode
      ? [
          env.npm_node_execpath,
          platform === "darwin" ? "/opt/homebrew/bin/node" : null,
          platform === "darwin" ? "/usr/local/bin/node" : null,
          ...pathCandidates,
          ...expandedManagerCandidates,
          "node",
        ]
      : []),
  ]);
}

function resolveBridgeWorkingDirectoryPath(options = {}) {
  const {
    dirname = __dirname,
    entrypoint,
    resourcesPath = process.resourcesPath,
  } = options;

  if (resourcesPath && isInsidePath(entrypoint, resourcesPath)) {
    return resourcesPath;
  }

  return path.resolve(dirname, "../../..");
}

module.exports = {
  resolveBridgeEntrypointPath,
  resolveBridgeWorkingDirectoryPath,
  resolveNodeBinaryCandidatePaths,
  resolveNodeDataChannelBinaryPath,
};

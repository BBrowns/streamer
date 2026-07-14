"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const REQUIRED_NODE_MAJOR = 24;
const REQUIRED_NODE_MINOR = 18;
const SUPPORTED_ARCHES = ["arm64", "x64"];

function normalizeArch(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "arm64" || normalized === "aarch64") return "arm64";
  if (
    normalized === "x64" ||
    normalized === "x86_64" ||
    normalized === "x86-64"
  ) {
    return "x64";
  }
  return null;
}

function parseNodeVersion(value) {
  const match = String(value || "").match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function isSupportedNodeVersion(value) {
  const version = parseNodeVersion(value);
  return Boolean(
    version &&
    version.major === REQUIRED_NODE_MAJOR &&
    version.minor >= REQUIRED_NODE_MINOR,
  );
}

function detectHostArch(options = {}) {
  const platform = options.platform || process.platform;
  const run = options.spawnSync || spawnSync;
  const fallback = normalizeArch(options.processArch || process.arch);

  if (platform !== "darwin" && platform !== "linux") return fallback;

  if (platform === "darwin") {
    const arm64Support = run("sysctl", ["-n", "hw.optional.arm64"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (String(arm64Support.stdout || "").trim() === "1") return "arm64";
  }

  const result = run("uname", ["-m"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return normalizeArch(result.stdout) || fallback;
}

function detectBinaryArch(binaryPath, options = {}) {
  const exists = options.exists || fs.existsSync;
  const platform = options.platform || process.platform;
  const run = options.spawnSync || spawnSync;
  if (!binaryPath || !exists(binaryPath)) return null;
  if (platform !== "darwin" && platform !== "linux") return null;

  const result = run("file", [binaryPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return null;

  const output = String(result.stdout || "").toLowerCase();
  const hasArm64 = output.includes("arm64") || output.includes("aarch64");
  const hasX64 = output.includes("x86_64") || output.includes("x86-64");
  if (hasArm64 === hasX64) return null;
  return hasArm64 ? "arm64" : "x64";
}

function inspectInstalledNativeArchitectures(options = {}) {
  const repositoryRoot = options.repositoryRoot || REPOSITORY_ROOT;
  const platform = options.platform || process.platform;
  const exists = options.exists || fs.existsSync;
  const nativeBinary = path.join(
    repositoryRoot,
    "node_modules/node-datachannel/build/Release/node_datachannel.node",
  );
  const nodeDataChannelArch = detectBinaryArch(nativeBinary, {
    exists,
    platform,
    spawnSync: options.spawnSync,
  });
  const esbuildArches = new Set();

  for (const arch of SUPPORTED_ARCHES) {
    const optionalPackage = path.join(
      repositoryRoot,
      "node_modules/@esbuild",
      `${platform}-${arch}`,
    );
    const downloadedBinary = path.join(
      repositoryRoot,
      "node_modules/esbuild/lib",
      `downloaded-@esbuild-${platform}-${arch}-esbuild`,
    );
    if (exists(optionalPackage) || exists(downloadedBinary)) {
      esbuildArches.add(arch);
    }
  }

  const fallbackArch = detectBinaryArch(
    path.join(repositoryRoot, "node_modules/esbuild/bin/esbuild"),
    {
      exists,
      platform,
      spawnSync: options.spawnSync,
    },
  );
  if (fallbackArch) esbuildArches.add(fallbackArch);

  return { nodeDataChannelArch, esbuildArches: [...esbuildArches] };
}

function determineTargetArch(input) {
  const nodeDataChannelArch = normalizeArch(input.nodeDataChannelArch);
  const esbuildArches = new Set(
    (input.esbuildArches || []).map(normalizeArch).filter(Boolean),
  );

  if (nodeDataChannelArch && esbuildArches.size > 0) {
    if (!esbuildArches.has(nodeDataChannelArch)) {
      throw new Error(
        `Native dependencies use different CPU architectures: node-datachannel is ${nodeDataChannelArch}, while esbuild is ${[...esbuildArches].join("/")}. Run \`npm run dev:repair-native\`.`,
      );
    }
    return nodeDataChannelArch;
  }

  if (nodeDataChannelArch) return nodeDataChannelArch;
  if (esbuildArches.size === 1) return [...esbuildArches][0];
  return normalizeArch(input.hostArch) || normalizeArch(input.processArch);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function resolveRuntimeCandidates(options = {}) {
  const repositoryRoot = options.repositoryRoot || REPOSITORY_ROOT;
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const homeDir = options.homeDir || os.homedir();
  const executable = platform === "win32" ? "node.exe" : "node";
  const nvmVersion = (() => {
    try {
      return fs
        .readFileSync(path.join(repositoryRoot, ".nvmrc"), "utf8")
        .trim();
    } catch {
      return "24.18.0";
    }
  })();
  const pathCandidates = String(env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((entry) => path.join(entry, executable));

  return unique([
    env.STREAMER_DEV_NODE,
    path.join(
      homeDir,
      ".nvm/versions/node",
      `v${nvmVersion}`,
      "bin",
      executable,
    ),
    path.join(
      repositoryRoot,
      "apps/desktop/vendor/node",
      `${platform}-${options.targetArch}`,
      "bin",
      executable,
    ),
    platform === "darwin" ? `/opt/homebrew/bin/${executable}` : null,
    platform === "darwin" ? `/usr/local/bin/${executable}` : null,
    process.execPath,
    ...pathCandidates,
    executable,
  ]);
}

function inspectNodeRuntime(candidate, options = {}) {
  const run = options.spawnSync || spawnSync;
  const result = run(
    candidate,
    [
      "-p",
      "JSON.stringify({arch:process.arch,version:process.version,execPath:process.execPath})",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (result.status !== 0) return null;

  try {
    return JSON.parse(String(result.stdout || "").trim());
  } catch {
    return null;
  }
}

function selectNodeRuntime(candidates, targetArch, options = {}) {
  const inspected = [];
  for (const candidate of candidates) {
    const runtime = (options.inspectRuntime || inspectNodeRuntime)(candidate);
    if (!runtime) continue;
    inspected.push(runtime);
    if (
      normalizeArch(runtime.arch) === targetArch &&
      isSupportedNodeVersion(runtime.version)
    ) {
      return runtime;
    }
  }

  const found = inspected.length
    ? inspected.map((item) => `${item.version}/${item.arch}`).join(", ")
    : "none";
  throw new Error(
    `No supported Node.js runtime was found for ${targetArch}. Streamer requires Node 24.18 or newer within Node 24. Found: ${found}. Run \`nvm install\` and \`nvm use\`, or set STREAMER_DEV_NODE.`,
  );
}

function resolveNpmCli(nodeExecPath, options = {}) {
  const exists = options.exists || fs.existsSync;
  const env = options.env || process.env;
  const candidates = unique([
    path.resolve(
      path.dirname(nodeExecPath),
      "../lib/node_modules/npm/bin/npm-cli.js",
    ),
    env.npm_execpath,
  ]);
  return candidates.find((candidate) => exists(candidate)) || null;
}

function findListeningPids(port, options = {}) {
  if ((options.platform || process.platform) === "win32") return [];
  const run = options.spawnSync || spawnSync;
  const result = run("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];
  return String(result.stdout || "")
    .split(/\s+/)
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

async function stopListeningProcesses(port, options = {}) {
  const pids = findListeningPids(port, options);
  if (pids.length === 0) return;

  console.log(
    `[dev-runtime] Stopping ${pids.length} existing listener(s) on port ${port}.`,
  );
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The listener may already have exited.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));

  for (const pid of findListeningPids(port, options)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The listener may already have exited.
    }
  }
}

function runForeground(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || REPOSITORY_ROOT,
      env: options.env || process.env,
      stdio: "inherit",
    });
    const forwardInterrupt = () => {
      if (!child.killed) child.kill("SIGINT");
    };
    const forwardTermination = () => {
      if (!child.killed) child.kill("SIGTERM");
    };
    process.once("SIGINT", forwardInterrupt);
    process.once("SIGTERM", forwardTermination);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", forwardInterrupt);
      process.removeListener("SIGTERM", forwardTermination);
      if (signal) return resolve(128);
      resolve(code ?? 1);
    });
  });
}

function resolveRuntime(options = {}) {
  const repositoryRoot = options.repositoryRoot || REPOSITORY_ROOT;
  const native = inspectInstalledNativeArchitectures({
    repositoryRoot,
    platform: options.platform,
    exists: options.exists,
    spawnSync: options.spawnSync,
  });
  const hostArch = detectHostArch({
    platform: options.platform,
    processArch: options.processArch,
    spawnSync: options.spawnSync,
  });
  const targetArch = determineTargetArch({
    ...native,
    hostArch,
    processArch: options.processArch || process.arch,
  });
  const candidates = resolveRuntimeCandidates({
    repositoryRoot,
    targetArch,
    platform: options.platform,
    env: options.env,
    homeDir: options.homeDir,
  });
  const runtime = selectNodeRuntime(candidates, targetArch, {
    inspectRuntime: options.inspectRuntime,
  });
  return { ...runtime, targetArch, native };
}

async function startStreamServer() {
  const runtime = resolveRuntime();
  const tsxCli = require.resolve("tsx/cli");
  const entrypoint = path.join(
    REPOSITORY_ROOT,
    "packages/stream-server/src/index.ts",
  );
  await stopListeningProcesses(11470);
  console.log(
    `[dev-runtime] Using ${runtime.execPath} (${runtime.version}/${runtime.arch}).`,
  );

  return runForeground(runtime.execPath, [tsxCli, "watch", entrypoint], {
    env: {
      ...process.env,
      PATH: `${path.dirname(runtime.execPath)}${path.delimiter}${process.env.PATH || ""}`,
      STREAMER_BRIDGE_RUNTIME_ARCH: runtime.targetArch,
    },
  });
}

async function repairNativeDependencies() {
  const hostArch = detectHostArch();
  const candidates = resolveRuntimeCandidates({ targetArch: hostArch });
  const runtime = selectNodeRuntime(candidates, hostArch);
  const npmCli = resolveNpmCli(runtime.execPath);
  if (!npmCli) {
    throw new Error(
      `Could not find npm next to ${runtime.execPath}. Run \`nvm use\` followed by \`npm rebuild esbuild node-datachannel\`.`,
    );
  }

  console.log(
    `[dev-runtime] Rebuilding native dependencies with ${runtime.version}/${runtime.arch}.`,
  );
  const exitCode = await runForeground(
    runtime.execPath,
    [npmCli, "rebuild", "esbuild", "node-datachannel"],
    {
      env: {
        ...process.env,
        PATH: `${path.dirname(runtime.execPath)}${path.delimiter}${process.env.PATH || ""}`,
      },
    },
  );
  if (exitCode !== 0) return exitCode;

  const repaired = inspectInstalledNativeArchitectures();
  const repairedArch = determineTargetArch({
    ...repaired,
    hostArch,
    processArch: process.arch,
  });
  if (repairedArch !== hostArch) {
    throw new Error(
      `Native dependencies still target ${repairedArch || "an unknown architecture"}; expected ${hostArch}. Run \`nvm use\`, remove node_modules, and reinstall dependencies.`,
    );
  }
  console.log(
    `[dev-runtime] Native dependencies now match ${hostArch}. Restart the stream server.`,
  );
  return 0;
}

async function main() {
  const command = process.argv[2];
  if (command === "stream-server") return startStreamServer();
  if (command === "repair-native") return repairNativeDependencies();
  throw new Error(`Unknown dev runtime command: ${command || "(missing)"}`);
}

if (require.main === module) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[dev-runtime] ${error.message || error}`);
      process.exitCode = 1;
    });
}

module.exports = {
  detectBinaryArch,
  detectHostArch,
  determineTargetArch,
  inspectInstalledNativeArchitectures,
  isSupportedNodeVersion,
  normalizeArch,
  parseNodeVersion,
  resolveNpmCli,
  selectNodeRuntime,
};

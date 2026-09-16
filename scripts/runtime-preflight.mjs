#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_API_URL = "http://127.0.0.1:3001/health";
const DEFAULT_BRIDGE_URL = "http://127.0.0.1:11470/api/health";
const DEFAULT_DATABASE_URL =
  "postgresql://streamer:streamer_dev@127.0.0.1:5432/streamer_db";
const CHECK_TIMEOUT_MS = 3_000;

const STATUS = Object.freeze({
  PASSED: "passed",
  DEGRADED: "degraded",
  BLOCKED: "blocked",
  UNKNOWN: "unknown",
});

export function parseArgs(argv) {
  const args = {
    json: false,
    surface: "playback",
    output: null,
    apiUrl: null,
    bridgeUrl: null,
    databaseUrl: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") args.json = true;
    else if (value === "--surface") args.surface = argv[++index] ?? "playback";
    else if (value === "--output") args.output = argv[++index] ?? null;
    else if (value === "--api-url") args.apiUrl = argv[++index] ?? null;
    else if (value === "--bridge-url") args.bridgeUrl = argv[++index] ?? null;
    else if (value === "--database-url")
      args.databaseUrl = argv[++index] ?? null;
    else throw new Error(`Unknown preflight argument: ${value}`);
  }
  if (!["playback", "server", "ui"].includes(args.surface)) {
    throw new Error("--surface must be playback, server, or ui");
  }
  return args;
}

function readPackage(rootPath = root) {
  return JSON.parse(readFileSync(join(rootPath, "package.json"), "utf8"));
}

function versionParts(value) {
  const match = String(value ?? "").match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function commandPath(command, commandRunner) {
  if (command.includes("/") && existsSync(command)) return command;
  const result = commandRunner("which", [command]);
  return result.status === 0 ? result.stdout.trim() : null;
}

function safeCommand(command, args, commandRunner) {
  const result = commandRunner(command, args);
  return {
    ok: result.status === 0,
    version: String(result.stdout ?? "").match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? null,
    path: commandPath(command, commandRunner),
  };
}

function binaryArchitecture(path, commandRunner) {
  if (!path) return null;
  const result = commandRunner("file", ["-b", path]);
  if (result.status !== 0) return null;
  const output = result.stdout.toLowerCase();
  if (output.includes("universal")) return "universal";
  if (output.includes("arm64") || output.includes("aarch64")) return "arm64";
  if (output.includes("x86-64") || output.includes("x86_64")) return "x64";
  return "unknown";
}

function checkResult(id, status, detail, extra = {}) {
  return { id, status, detail, ...extra };
}

function checkToolchain({ env, arch, commandRunner, requireMediaRuntime = true }) {
  let packageJson;
  try {
    packageJson = readPackage(root);
  } catch {
    return checkResult(
      "toolchain",
      STATUS.BLOCKED,
      "package_metadata_unavailable",
      {
        failureCode: "TOOLCHAIN_METADATA_UNAVAILABLE",
      },
    );
  }

  const expectedNode = versionParts(packageJson.engines?.node);
  const expectedNpm = versionParts(packageJson.packageManager);
  const actualNode = versionParts(process.version);
  const npm = safeCommand("npm", ["--version"], commandRunner);
  const actualNpm = versionParts(npm.version);
  const nodeMatches =
    expectedNode &&
    actualNode &&
    compareVersions(actualNode, expectedNode) >= 0;
  const npmMatches =
    expectedNpm && actualNpm && compareVersions(actualNpm, expectedNpm) >= 0;
  if (!nodeMatches || !npmMatches) {
    return checkResult(
      "toolchain",
      STATUS.BLOCKED,
      "supported_toolchain_mismatch",
      {
        failureCode: "TOOLCHAIN_MISMATCH",
        node: process.version,
        npm: npm.version,
        arch,
      },
    );
  }

  if (!requireMediaRuntime) {
    return checkResult("toolchain", STATUS.PASSED, "supported_toolchain_ready", {
      arch,
      npm: npm.version,
    });
  }

  const ffmpeg = safeCommand(
    env.STREAMER_FFMPEG_PATH?.trim() || "ffmpeg",
    ["-version"],
    commandRunner,
  );
  const ffprobe = safeCommand(
    env.STREAMER_FFPROBE_PATH?.trim() || "ffprobe",
    ["-version"],
    commandRunner,
  );
  if (!ffmpeg.ok || !ffprobe.ok) {
    return checkResult(
      "toolchain",
      STATUS.BLOCKED,
      "ffmpeg_runtime_unavailable",
      {
        failureCode: "FFMPEG_UNAVAILABLE",
        arch,
        ffmpeg: ffmpeg.ok ? "available" : "missing",
        ffprobe: ffprobe.ok ? "available" : "missing",
      },
    );
  }

  const architectures = [
    binaryArchitecture(ffmpeg.path, commandRunner),
    binaryArchitecture(ffprobe.path, commandRunner),
  ];
  const incompatible = architectures.some(
    (value) =>
      value && value !== "unknown" && value !== "universal" && value !== arch,
  );
  if (incompatible) {
    return checkResult(
      "toolchain",
      STATUS.BLOCKED,
      "native_binary_architecture_mismatch",
      {
        failureCode: "NATIVE_ARCHITECTURE_MISMATCH",
        arch,
        ffmpegArchitecture: architectures[0],
        ffprobeArchitecture: architectures[1],
      },
    );
  }
  return checkResult(
    "toolchain",
    STATUS.PASSED,
    "toolchain_and_media_runtime_ready",
    {
      arch,
      ffmpeg: ffmpeg.version,
      ffprobe: ffprobe.version,
    },
  );
}

async function checkHttp(id, url, fetchImpl) {
  if (!url) return checkResult(id, STATUS.UNKNOWN, "endpoint_not_configured");
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (response.ok)
      return checkResult(id, STATUS.PASSED, "endpoint_reachable");
    return checkResult(id, STATUS.BLOCKED, "endpoint_returned_error", {
      failureCode: `${id.toUpperCase()}_UNAVAILABLE`,
      responseClass: `${Math.floor(response.status / 100)}xx`,
    });
  } catch {
    return checkResult(id, STATUS.BLOCKED, "endpoint_unreachable", {
      failureCode: `${id.toUpperCase()}_UNREACHABLE`,
    });
  }
}

function parseDatabaseTarget(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    return { host: parsed.hostname, port: Number(parsed.port || 5432) };
  } catch {
    return null;
  }
}

function checkDatabase(databaseUrl, tcpProbe) {
  const target = parseDatabaseTarget(databaseUrl);
  if (!target)
    return checkResult("database", STATUS.BLOCKED, "database_url_invalid", {
      failureCode: "DATABASE_CONFIG_INVALID",
    });
  return tcpProbe(target.host, target.port)
    ? checkResult("database", STATUS.PASSED, "database_port_reachable")
    : checkResult("database", STATUS.BLOCKED, "database_port_unreachable", {
        failureCode: "DATABASE_UNAVAILABLE",
      });
}

function defaultTcpProbe(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(CHECK_TIMEOUT_MS, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export async function runRuntimePreflight({
  env = process.env,
  arch = process.arch,
  fetchImpl = globalThis.fetch,
  commandRunner = (command, args) =>
    spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  tcpProbe = defaultTcpProbe,
  surface = "playback",
} = {}) {
  const startedAt = Date.now();
  const checks = [
    checkToolchain({
      env,
      arch,
      commandRunner,
      requireMediaRuntime: surface !== "ui",
    }),
  ];
  if (surface !== "ui") {
    checks.push(
      await checkHttp(
        "api",
        env.STREAMER_PREFLIGHT_API_URL || DEFAULT_API_URL,
        fetchImpl,
      ),
    );
    checks.push(
      checkDatabase(env.DATABASE_URL || DEFAULT_DATABASE_URL, tcpProbe),
    );
  }
  if (surface === "playback") {
    checks.push(
      await checkHttp(
        "bridge",
        env.STREAMER_PREFLIGHT_BRIDGE_URL || DEFAULT_BRIDGE_URL,
        fetchImpl,
      ),
    );
  }
  const blocked = checks.some((check) => check.status === STATUS.BLOCKED);
  const degraded = checks.some((check) => check.status === STATUS.DEGRADED);
  const unknown = checks.some((check) => check.status === STATUS.UNKNOWN);
  const status = blocked
    ? STATUS.BLOCKED
    : degraded
      ? STATUS.DEGRADED
      : unknown
        ? STATUS.UNKNOWN
        : STATUS.PASSED;
  return {
    version: 1,
    generatedAt: new Date(startedAt).toISOString(),
    elapsedMs: Math.max(0, Date.now() - startedAt),
    surface,
    status,
    checks,
  };
}

function renderHuman(result) {
  return [
    `Runtime preflight: ${result.status}`,
    `Surface: ${result.surface}`,
    ...result.checks.map(
      (check) => `- ${check.id}: ${check.status} (${check.detail})`,
    ),
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await runRuntimePreflight({
    surface: args.surface,
    env: {
      ...process.env,
      ...(args.apiUrl ? { STREAMER_PREFLIGHT_API_URL: args.apiUrl } : {}),
      ...(args.bridgeUrl
        ? { STREAMER_PREFLIGHT_BRIDGE_URL: args.bridgeUrl }
        : {}),
      ...(args.databaseUrl ? { DATABASE_URL: args.databaseUrl } : {}),
    },
  });
  if (args.output) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(dirname(join(root, args.output)), { recursive: true });
    writeFileSync(
      join(root, args.output),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }
  console.log(
    args.json ? JSON.stringify(result, null, 2) : renderHuman(result),
  );
  return result.status === STATUS.BLOCKED ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

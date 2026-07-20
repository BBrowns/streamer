"use strict";

const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const SERVER_ENV_PATH = path.join(REPOSITORY_ROOT, "server", ".env");
const DEFAULT_POSTGRES_PORT = 5432;
const DEFAULT_CONNECT_TIMEOUT_MS = 1_500;
const DEFAULT_COMPOSE_READY_TIMEOUT_MS = 30_000;
const COMPOSE_READY_RETRY_MS = 500;
const DEV_DATABASE_MODES = new Set(["auto", "compose", "external"]);

function parseEnvFile(contents) {
  const values = {};

  for (const rawLine of String(contents || "").split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice("export ".length).trim();

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(separatorIndex + 1).trim();
    const quote = value.at(0);
    if (
      value.length >= 2 &&
      (quote === '"' || quote === "'") &&
      value.at(-1) === quote
    ) {
      value = value.slice(1, -1);
    } else {
      const inlineComment = value.search(/\s+#/);
      if (inlineComment >= 0) value = value.slice(0, inlineComment).trimEnd();
    }

    values[key] = value;
  }

  return values;
}

function readServerEnv(options = {}) {
  const envPath = options.envPath || SERVER_ENV_PATH;
  const readFileSync = options.readFileSync || fs.readFileSync;

  try {
    return parseEnvFile(readFileSync(envPath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    throw error;
  }
}

function valueFromEnvironment(key, environment, fileEnvironment) {
  if (Object.hasOwn(environment, key)) {
    const runtimeValue = environment[key];
    return typeof runtimeValue === "string" ? runtimeValue.trim() : "";
  }

  const fileValue = fileEnvironment[key];
  return typeof fileValue === "string" ? fileValue.trim() : "";
}

function parseDevDatabaseMode(value) {
  const mode =
    String(value || "auto")
      .trim()
      .toLowerCase() || "auto";
  if (!DEV_DATABASE_MODES.has(mode)) {
    throw new Error(
      "STREAMER_DEV_DATABASE must be one of: auto, compose, external.",
    );
  }
  return mode;
}

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
}

function isLoopbackHostname(hostname) {
  return new Set(["localhost", "127.0.0.1", "::1"]).has(
    normalizeHostname(hostname),
  );
}

function parseDatabaseTarget(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error(
      "DATABASE_URL must use the postgres or postgresql protocol.",
    );
  }

  const hostname = normalizeHostname(parsed.hostname);
  const port = parsed.port ? Number(parsed.port) : DEFAULT_POSTGRES_PORT;
  if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      "DATABASE_URL must include a valid PostgreSQL host and port.",
    );
  }

  return {
    hostname,
    port,
    isLoopback: isLoopbackHostname(hostname),
  };
}

function formatDatabaseEndpoint(target) {
  const hostname = target.hostname.includes(":")
    ? `[${target.hostname}]`
    : target.hostname;
  return `${hostname}:${target.port}`;
}

function resolveDatabaseConfiguration(options = {}) {
  const environment = options.environment || process.env;
  const fileEnvironment = options.fileEnvironment || readServerEnv(options);
  const databaseUrl = valueFromEnvironment(
    "DATABASE_URL",
    environment,
    fileEnvironment,
  );

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured. Copy server/.env.example to server/.env before starting the API server.",
    );
  }

  return {
    mode: parseDevDatabaseMode(
      valueFromEnvironment(
        "STREAMER_DEV_DATABASE",
        environment,
        fileEnvironment,
      ),
    ),
    target: parseDatabaseTarget(databaseUrl),
  };
}

function checkTcpConnection(target, options = {}) {
  const createConnection = options.createConnection || net.createConnection;
  const timeoutMs = options.timeoutMs || DEFAULT_CONNECT_TIMEOUT_MS;

  return new Promise((resolve) => {
    let settled = false;
    let socket;

    const finish = (connected) => {
      if (settled) return;
      settled = true;
      if (socket && typeof socket.destroy === "function") socket.destroy();
      resolve(connected);
    };

    try {
      socket = createConnection({
        host: target.hostname,
        port: target.port,
      });
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.once("timeout", () => finish(false));
      if (typeof socket.setTimeout === "function") socket.setTimeout(timeoutMs);
    } catch {
      finish(false);
    }
  });
}

function runCommand(command, args, options = {}) {
  const spawnProcess = options.spawnProcess || spawn;

  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd: options.cwd || REPOSITORY_ROOT,
      env: options.environment || process.env,
      stdio: options.stdio || "inherit",
    });

    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

function exitCode(result) {
  if (typeof result === "number") return result;
  return Number.isInteger(result && result.code) ? result.code : 1;
}

async function runCompose(args, options = {}) {
  const commandRunner = options.commandRunner || runCommand;
  let result;

  try {
    result = await commandRunner("docker", ["compose", ...args], options);
  } catch (error) {
    throw new Error(
      `Docker Compose could not be started (${error && error.message ? error.message : "unknown error"}). Start Docker Desktop, then run \`npm run dev:db\`.`,
    );
  }

  if (exitCode(result) !== 0) {
    throw new Error(
      "Docker Compose could not prepare the local database. Start Docker Desktop, then run `npm run dev:db`.",
    );
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function startComposeDatabase(options = {}) {
  const log = options.log || console.log;
  const now = options.now || Date.now;
  const wait = options.delay || delay;
  const timeoutMs = options.timeoutMs || DEFAULT_COMPOSE_READY_TIMEOUT_MS;
  const retryMs = options.retryMs || COMPOSE_READY_RETRY_MS;

  log("[dev-db] Starting the local PostgreSQL Compose service (db only).");
  await runCompose(["up", "-d", "db"], options);

  const deadline = now() + timeoutMs;
  while (now() <= deadline) {
    try {
      await runCompose(
        [
          "exec",
          "-T",
          "db",
          "pg_isready",
          "-U",
          "streamer",
          "-d",
          "streamer_db",
        ],
        { ...options, stdio: "ignore" },
      );
      log("[dev-db] Local PostgreSQL is ready.");
      return;
    } catch {
      if (now() >= deadline) break;
      await wait(retryMs);
    }
  }

  throw new Error(
    "The local PostgreSQL Compose service did not become ready within 30 seconds. Inspect it with `docker compose logs db --tail=100`.",
  );
}

async function waitForTcpConnection(target, options = {}) {
  const canConnect = options.canConnect || checkTcpConnection;
  const now = options.now || Date.now;
  const wait = options.delay || delay;
  const timeoutMs = options.timeoutMs || DEFAULT_COMPOSE_READY_TIMEOUT_MS;
  const retryMs = options.retryMs || COMPOSE_READY_RETRY_MS;
  const deadline = now() + timeoutMs;

  while (now() <= deadline) {
    if (await canConnect(target, options)) return true;
    if (now() >= deadline) break;
    await wait(retryMs);
  }

  return false;
}

async function preflightDatabase(options = {}) {
  const log = options.log || console.log;
  const configuration =
    options.configuration || resolveDatabaseConfiguration(options);
  const { mode, target } = configuration;
  const endpoint = formatDatabaseEndpoint(target);
  const canConnect = options.canConnect || checkTcpConnection;

  if (mode === "compose" && !target.isLoopback) {
    throw new Error(
      "STREAMER_DEV_DATABASE=compose requires DATABASE_URL to use a loopback host. Use STREAMER_DEV_DATABASE=external for a remotely managed database.",
    );
  }

  if (await canConnect(target, options)) {
    log(`[dev-db] PostgreSQL is reachable at ${endpoint}.`);
    return { action: "connected", mode, target };
  }

  if (!target.isLoopback) {
    throw new Error(
      `PostgreSQL is not reachable at ${endpoint}. The dev launcher only manages loopback databases; verify the external database connection before retrying.`,
    );
  }

  if (mode === "external") {
    throw new Error(
      `PostgreSQL is not reachable at ${endpoint}. STREAMER_DEV_DATABASE=external prevents Docker Compose from being started; start the separately managed database or remove that opt-out.`,
    );
  }

  log(
    `[dev-db] PostgreSQL is not reachable at ${endpoint}; preparing the local Compose database.`,
  );
  const startDatabase = options.startDatabase || startComposeDatabase;
  await startDatabase(options);

  const waitForConnection = options.waitForConnection || waitForTcpConnection;
  if (!(await waitForConnection(target, options))) {
    throw new Error(
      `Docker Compose reported a ready database, but PostgreSQL is still not reachable at ${endpoint}. Run \`docker compose logs db --tail=100\`.`,
    );
  }

  log(`[dev-db] PostgreSQL is reachable at ${endpoint}.`);
  return { action: "started-compose", mode, target };
}

async function showComposeStatus(options = {}) {
  await runCompose(["ps", "db"], options);
}

async function main(argv = process.argv, options = {}) {
  const command = argv[2] || "preflight";
  if (command === "preflight") return preflightDatabase(options);
  if (command === "start") return startComposeDatabase(options);
  if (command === "status") return showComposeStatus(options);
  throw new Error(
    `Unknown development database command: ${command}. Use preflight, start, or status.`,
  );
}

if (require.main === module) {
  main()
    .then(() => {
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error(`[dev-db] ${error.message || error}`);
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_POSTGRES_PORT,
  checkTcpConnection,
  formatDatabaseEndpoint,
  isLoopbackHostname,
  main,
  parseDatabaseTarget,
  parseDevDatabaseMode,
  parseEnvFile,
  preflightDatabase,
  readServerEnv,
  resolveDatabaseConfiguration,
  runCompose,
  startComposeDatabase,
  waitForTcpConnection,
};

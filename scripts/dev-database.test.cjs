"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isLoopbackHostname,
  parseDatabaseTarget,
  parseEnvFile,
  preflightDatabase,
  resolveDatabaseConfiguration,
  startComposeDatabase,
} = require("./dev-database.cjs");

test("parses quoted server environment values without changing URL fragments", () => {
  assert.deepEqual(
    parseEnvFile(
      [
        "# comment",
        'DATABASE_URL="postgresql://streamer:secret@127.0.0.1:5432/streamer_db?schema=public#fragment"',
        "STREAMER_DEV_DATABASE=external # separately managed",
      ].join("\n"),
    ),
    {
      DATABASE_URL:
        "postgresql://streamer:secret@127.0.0.1:5432/streamer_db?schema=public#fragment",
      STREAMER_DEV_DATABASE: "external",
    },
  );
});

test("recognizes only loopback PostgreSQL hosts as Compose-managed candidates", () => {
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("[::1]"), true);
  assert.equal(isLoopbackHostname("db"), false);
  assert.equal(isLoopbackHostname("postgres.example.test"), false);

  assert.deepEqual(
    parseDatabaseTarget(
      "postgresql://streamer:secret@[::1]:5433/streamer_db?schema=public",
    ),
    { hostname: "::1", port: 5433, isLoopback: true },
  );
});

test("uses process environment values over server/.env values", () => {
  const configuration = resolveDatabaseConfiguration({
    environment: {
      DATABASE_URL: "postgresql://user:secret@db.example.test:5432/external",
      STREAMER_DEV_DATABASE: "external",
    },
    fileEnvironment: {
      DATABASE_URL:
        "postgresql://streamer:streamer_dev@127.0.0.1:5432/streamer_db",
      STREAMER_DEV_DATABASE: "auto",
    },
  });

  assert.equal(configuration.mode, "external");
  assert.deepEqual(configuration.target, {
    hostname: "db.example.test",
    port: 5432,
    isLoopback: false,
  });
});

test("does not silently replace an explicitly blank DATABASE_URL from the shell", () => {
  assert.throws(
    () =>
      resolveDatabaseConfiguration({
        environment: { DATABASE_URL: "" },
        fileEnvironment: {
          DATABASE_URL:
            "postgresql://streamer:streamer_dev@127.0.0.1:5432/streamer_db",
        },
      }),
    /DATABASE_URL is not configured/,
  );
});

test("starts Compose only for an unavailable loopback database in auto mode", async () => {
  let startCalls = 0;
  const messages = [];
  const result = await preflightDatabase({
    configuration: {
      mode: "auto",
      target: { hostname: "127.0.0.1", port: 5432, isLoopback: true },
    },
    canConnect: async () => false,
    startDatabase: async () => {
      startCalls += 1;
    },
    waitForConnection: async () => true,
    log: (message) => messages.push(message),
  });

  assert.equal(startCalls, 1);
  assert.equal(result.action, "started-compose");
  assert.match(messages.join("\n"), /127\.0\.0\.1:5432/);
  assert.doesNotMatch(messages.join("\n"), /streamer_dev|secret/);
});

test("external mode never starts Compose for an unavailable loopback database", async () => {
  let startCalls = 0;

  await assert.rejects(
    preflightDatabase({
      configuration: {
        mode: "external",
        target: { hostname: "localhost", port: 5432, isLoopback: true },
      },
      canConnect: async () => false,
      startDatabase: async () => {
        startCalls += 1;
      },
      log: () => {},
    }),
    /prevents Docker Compose/,
  );

  assert.equal(startCalls, 0);
});

test("remote databases are never started through Docker Compose", async () => {
  let startCalls = 0;

  await assert.rejects(
    preflightDatabase({
      configuration: {
        mode: "auto",
        target: {
          hostname: "db.example.test",
          port: 5432,
          isLoopback: false,
        },
      },
      canConnect: async () => false,
      startDatabase: async () => {
        startCalls += 1;
      },
      log: () => {},
    }),
    /only manages loopback databases/,
  );

  assert.equal(startCalls, 0);
});

test("Compose startup addresses only the db service and waits for PostgreSQL", async () => {
  const commands = [];

  await startComposeDatabase({
    commandRunner: async (command, args) => {
      commands.push([command, args]);
      return 0;
    },
    log: () => {},
    now: () => 0,
  });

  assert.deepEqual(commands, [
    ["docker", ["compose", "up", "-d", "db"]],
    [
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "db",
        "pg_isready",
        "-U",
        "streamer",
        "-d",
        "streamer_db",
      ],
    ],
  ]);
  assert.equal(
    commands.flat().includes("server"),
    false,
    "the local API container must not be started by the database helper",
  );
});

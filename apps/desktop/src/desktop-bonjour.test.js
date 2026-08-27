"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createDesktopBonjourInstanceId,
  createDesktopBonjourServiceConfig,
} = require("./desktop-bonjour");

test("desktop Bonjour advertisements use an opaque per-process identity", () => {
  const firstId = createDesktopBonjourInstanceId(() =>
    Buffer.from("001122334455", "hex"),
  );
  const secondId = createDesktopBonjourInstanceId(() =>
    Buffer.from("aabbccddeeff", "hex"),
  );
  const first = createDesktopBonjourServiceConfig({
    hostname: "Julian-MacBook-Pro.local",
    appVersion: "1.2.3",
    port: 11470,
    instanceId: firstId,
  });
  const second = createDesktopBonjourServiceConfig({
    hostname: "Julian-MacBook-Pro.local",
    appVersion: "1.2.3",
    port: 11470,
    instanceId: secondId,
  });

  assert.equal(firstId, "001122334455");
  assert.equal(secondId, "aabbccddeeff");
  assert.notEqual(first.name, second.name);
  assert.equal(first.type, "streamer-bridge");
  assert.equal(first.protocol, "tcp");
  assert.equal(first.port, 11470);
  assert.deepEqual(first.txt, { version: "1.2.3", id: firstId });
  assert.ok(Buffer.byteLength(first.name, "utf8") <= 63);
});

test("desktop Bonjour metadata never contains the Electron user-data path", () => {
  const privatePath = "/Users/example/Library/Application Support/Streamer";
  const config = createDesktopBonjourServiceConfig({
    hostname: privatePath,
    appVersion: "1.2.3",
    port: 11470,
    instanceId: "001122334455",
  });

  assert.doesNotMatch(JSON.stringify(config), /Application Support/);
  assert.equal(config.txt.id, "001122334455");
});

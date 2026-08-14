import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function makeUdpAnnounce(ipBytes) {
  const message = Buffer.alloc(98);
  Buffer.from("0000041727101980", "hex").copy(message, 0);
  message.writeUInt32BE(1, 8);
  message.writeUInt32BE(1234, 12);
  message.fill(0x61, 16, 36);
  message.fill(0x62, 36, 56);
  message.writeUInt32BE(0, 80);
  Buffer.from(ipBytes).copy(message, 84);
  message.writeUInt32BE(42, 88);
  message.writeUInt32BE(1, 92);
  message.writeUInt16BE(6881, 96);
  return message;
}

async function loadUdpParser() {
  return (
    await import(
      pathToFileURL(
        resolve(
          repoRoot,
          "node_modules/bittorrent-tracker/lib/server/parse-udp.js",
        ),
      )
    )
  ).default;
}

test("bittorrent-tracker UDP parsing keeps IPv4 conversion without ip", async () => {
  const parser = await loadUdpParser();
  const result = parser(makeUdpAnnounce([192, 0, 2, 44]), {
    address: "198.51.100.10",
    port: 6881,
  });

  assert.equal(result.ip, "192.0.2.44");
  assert.equal(result.addr, "192.0.2.44:6881");
});

test("bittorrent-tracker falls back to the peer address when the optional IP is zero", async () => {
  const parser = await loadUdpParser();
  const result = parser(makeUdpAnnounce([0, 0, 0, 0]), {
    address: "198.51.100.10",
    port: 6881,
  });

  assert.equal(result.ip, "198.51.100.10");
});

test("image-size processes a zero-length ICNS entry without blocking", () => {
  const script = `
    const imageSize = require(${JSON.stringify(resolve(repoRoot, "node_modules/image-size"))});
    const input = Buffer.alloc(16);
    input.write("icns", 0, "ascii");
    input.writeUInt32BE(16, 4);
    input.write("icm4", 8, "ascii");
    input.writeUInt32BE(0, 12);
    imageSize(input);
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    timeout: 1000,
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

test("image-size still reads valid ICNS dimensions", () => {
  const imageSize = require("image-size");
  const input = Buffer.alloc(16);
  input.write("icns", 0, "ascii");
  input.writeUInt32BE(16, 4);
  input.write("icm4", 8, "ascii");
  input.writeUInt32BE(8, 12);

  assert.deepEqual(imageSize(input), { height: 16, type: "icm4", width: 16 });
});

test("the patched tracker no longer imports the vulnerable ip module", () => {
  const trackerSource = execFileSync(
    process.execPath,
    [
      "-e",
      "process.stdout.write(require('fs').readFileSync(process.argv[1], 'utf8'))",
      resolve(
        repoRoot,
        "node_modules/bittorrent-tracker/lib/server/parse-udp.js",
      ),
    ],
    { encoding: "utf8" },
  );

  assert.doesNotMatch(trackerSource, /from ['"]ip['"]/);
});

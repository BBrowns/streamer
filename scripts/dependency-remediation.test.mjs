import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("query-string bounds work on a long malformed percent-encoded value", () => {
  execFileSync(
    process.execPath,
    [
      "-e",
      `
    const assert = require('node:assert/strict');
    const query = require('query-string');
    const malformed = '%E0%A4'.repeat(4000);
    const result = query.parse('value=' + malformed);
    assert.equal(typeof result.value, 'string');
    assert.ok(result.value.length > 0);
  `,
    ],
    { cwd: repoRoot, timeout: 3000, stdio: "pipe" },
  );
});

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

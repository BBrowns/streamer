import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const braces = require("braces");
const forge = require("node-forge");

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

test("braces rejects deeply nested input before recursive walkers overflow", () => {
  const excessiveDepth = `${"{".repeat(101)}a${"}".repeat(101)}`;
  assert.throws(
    () => braces(excessiveDepth),
    /Input nesting depth exceeds max \(100\)/,
  );

  const excessiveParentheses = `${"(".repeat(101)}a${")".repeat(101)}`;
  assert.throws(
    () => braces(excessiveParentheses),
    /Input nesting depth exceeds max \(100\)/,
  );

  const supportedDepth = `${"{".repeat(100)}a${"}".repeat(100)}`;
  assert.doesNotThrow(() => braces(supportedDepth));
});

test("node-forge rejects extra children in nested DigestAlgorithm sequences", () => {
  // Regression vector from digitalbazaar/forge PR #1152 (CVE-2026-85393).
  const modulus = [
    "E932AC92252F585B3A80A4DD76A897C8B7652952FE788F6EC8DD640587A1EE56",
    "47670A8AD4C2BE0F9FA6E49C605ADF77B5174230AF7BD50E5D6D6D6D28CCF0A8",
    "86A514CC72E51D209CC772A52EF419F6A953F3135929588EBE9B351FCA61CED7",
    "8F346FE00DBB6306E5C2A4C6DFC3779AF85AB417371CF34D8387B9B30AE46D7A",
    "5FF5A655B8D8455F1B94AE736989D60A6F2FD5CADBFFBD504C5A756A2E6BB5CE",
    "CC13BCA7503F6DF8B52ACE5C410997E98809DB4DC30D943DE4E812A47553DCE5",
    "4844A78E36401D13F77DC650619FED88D8B3926E3D8E319C80C744779AC5D6AB",
    "E252896950917476ECE5E8FC27D5F053D6018D91B502C4787558A002B9283DA7",
  ].join("");
  const signature = forge.util.hexToBytes(
    [
      "a4ae63dd5e7712b78f4870d0f51e294df5503d4f16c5d27ae33370981fb57f0d",
      "e49f50f3d6a04666774cd984cd13972db9bf8e12bd294ef0ddc916c7c86cbae6",
      "3efd7b6b97885e69760c208a40f1aecc76a90d7af5145177efce1bb55807a8d0",
      "5c20b1596753ba710642fc9acdde6c160232654662c77cc4466c8257a38edb49",
      "f894e8845d0fd987b857ced88f4b62505a080bd87ef700d35d392a6e8f6fde34",
      "250c50b86fae606cb551215e8f4813239b77651d5565ad453698c071d48c31e8",
      "e526fb4a37610f64b3e1fb8e5be5898e408ad08197a0947794a530b54f844853",
      "77ce4a7488ed485ce4e5e105dd89698a472f390c3b1b76bc16b73276c4d1c81d",
    ].join(""),
  );
  const publicKey = forge.pki.rsa.setPublicKey(
    new forge.jsbn.BigInteger(modulus, 16),
    new forge.jsbn.BigInteger("3", 10),
  );
  const digest = forge.md.sha256.create();
  digest.update("hello world!");

  assert.throws(
    () =>
      publicKey.verify(digest.digest().getBytes(), signature, undefined, {
        _parseAllDigestBytes: true,
        _skipPaddingChecks: true,
      }),
    /ASN\.1 object does not contain a valid RSASSA-PKCS1-v1_5 DigestInfo value/,
  );
});

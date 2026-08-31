"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPinnedLookup,
  validateDownloadUrlWithDns,
} = require("./download-url-policy");

test("allows public HTTPS and pins requests to validated DNS results", async () => {
  const validated = await validateDownloadUrlWithDns(
    "https://media.example.test/movie.mp4",
    async () => [{ address: "93.184.216.34", family: 4 }],
  );

  assert.equal(validated.kind, "public-https");
  const lookup = createPinnedLookup(validated.addresses);
  await new Promise((resolve, reject) => {
    lookup("media.example.test", {}, (error, address, family) => {
      if (error) return reject(error);
      assert.equal(address, "93.184.216.34");
      assert.equal(family, 4);
      resolve();
    });
  });
});

test("allows only exact signed loopback bridge stream routes", async () => {
  const signed =
    "http://127.0.0.1:11470/api/bridge/v1/jobs/00000000-0000-4000-8000-000000000001/stream?expires=123&signature=sig";
  await expectPolicy(signed, "bridge");

  for (const blocked of [
    "http://127.0.0.1:11470/api/health",
    "http://127.0.0.1:11470/api/bridge/v1/jobs/00000000-0000-4000-8000-000000000001/stream",
    "http://192.168.1.10:11470/api/bridge/v1/jobs/00000000-0000-4000-8000-000000000001/stream?expires=123&signature=sig",
  ]) {
    await assert.rejects(() => validateDownloadUrlWithDns(blocked));
  }
});

test("rejects public HTTP and private or mixed DNS answers", async () => {
  await assert.rejects(() =>
    validateDownloadUrlWithDns("http://media.example.test/movie.mp4"),
  );
  await assert.rejects(() =>
    validateDownloadUrlWithDns("https://127.0.0.1/movie.mp4"),
  );
  await assert.rejects(() =>
    validateDownloadUrlWithDns(
      "https://media.example.test/movie.mp4",
      async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
    ),
  );
});

test("rejects all IPv6 link-local ranges", async () => {
  for (const address of ["fe80::1", "fe90::1", "fea0::1", "febf::1"]) {
    await assert.rejects(() =>
      validateDownloadUrlWithDns(`https://[${address}]/movie.mp4`),
    );
  }
});

test("rejects IPv4-compatible IPv6 forms of private addresses", async () => {
  for (const address of ["::c0a8:101", "::a00:1", "::7f00:1"]) {
    await assert.rejects(() =>
      validateDownloadUrlWithDns(`https://[${address}]/movie.mp4`),
    );
  }
});

async function expectPolicy(url, kind) {
  const validated = await validateDownloadUrlWithDns(url, async () => {
    throw new Error("Bridge loopback URLs must not perform DNS lookups");
  });
  assert.equal(validated.kind, kind);
}

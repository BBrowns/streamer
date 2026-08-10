import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAuditReport, REVIEWED_ADVISORIES } from "./security-audit.mjs";

function reportFor({
  name,
  severity = "high",
  url,
  source = 1,
  nodes = [`node_modules/${name}`],
}) {
  return {
    vulnerabilities: {
      [name]: {
        nodes,
        via: [
          {
            source,
            name,
            dependency: name,
            title: `${name} advisory`,
            url,
            severity,
          },
        ],
      },
    },
  };
}

test("allows only the exact reviewed brace-expansion advisory before expiry", () => {
  const result = evaluateAuditReport(
    reportFor({
      name: "brace-expansion",
      url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
      nodes: ["node_modules/test-exclude/node_modules/brace-expansion"],
    }),
    { now: new Date("2026-07-28T00:00:00.000Z") },
  );

  assert.equal(result.blocking.length, 0);
  assert.equal(result.reviewed.length, 1);
});

test("blocks an unreviewed high advisory", () => {
  const result = evaluateAuditReport(
    reportFor({
      name: "fast-uri",
      url: "https://github.com/advisories/GHSA-v2hh-gcrm-f6hx",
    }),
  );

  assert.equal(result.blocking.length, 1);
  assert.equal(result.reviewed.length, 0);
});

test("blocks the reviewed advisory after its expiry", () => {
  const result = evaluateAuditReport(
    reportFor({
      name: "brace-expansion",
      url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
      nodes: ["node_modules/test-exclude/node_modules/brace-expansion"],
    }),
    { now: new Date("2026-10-01T00:00:00.000Z") },
  );

  assert.equal(result.blocking.length, 1);
});

test("blocks the reviewed advisory on an unexpected dependency path", () => {
  const result = evaluateAuditReport(
    reportFor({
      name: "brace-expansion",
      url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
      nodes: ["node_modules/runtime-package/node_modules/brace-expansion"],
    }),
    { now: new Date("2026-07-28T00:00:00.000Z") },
  );

  assert.equal(result.blocking.length, 1);
  assert.equal(result.reviewed.length, 0);
});

test("blocks an advisory when the dependency does not match the exception", () => {
  const result = evaluateAuditReport(
    reportFor({
      name: "different-package",
      url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
    }),
    {
      exceptions: REVIEWED_ADVISORIES,
      now: new Date("2026-07-28T00:00:00.000Z"),
    },
  );

  assert.equal(result.blocking.length, 1);
});

test("allows the reviewed image-size findings only on the Metro node", () => {
  for (const advisory of ["GHSA-w3rx-r6r6-pgpr", "GHSA-5p2g-fcmc-qvqq"]) {
    const result = evaluateAuditReport(
      reportFor({
        name: "image-size",
        url: `https://github.com/advisories/${advisory}`,
        nodes: ["node_modules/image-size"],
      }),
      { now: new Date("2026-07-28T00:00:00.000Z") },
    );

    assert.equal(result.blocking.length, 0);
    assert.equal(result.reviewed.length, 1);
  }
});

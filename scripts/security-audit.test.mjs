import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  evaluateAuditReport,
  LOCAL_SECURITY_PATCHES,
  REVIEWED_ADVISORIES,
} from "./security-audit.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const historicalExceptions = {
  "GHSA-MH99-V99M-4GVG": {
    dependency: "brace-expansion",
    expiresOn: "2026-09-30",
    owner: "test maintainers",
    reason: "Historical compatibility test fixture",
    nextAction: "Remove after the test fixture no longer needs the exception.",
    scope: "repository-controlled transform, test, and packaging globs",
    allowedNodes: ["node_modules/test-exclude/node_modules/brace-expansion"],
  },
};

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

const currentVulnerableAdvisories = [
  {
    id: "GHSA-VFJ7-8CJW-P6XM",
    name: "braces",
    url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
    nodes: ["node_modules/braces"],
  },
  {
    id: "GHSA-86W9-CPQP-85RV",
    name: "node-forge",
    url: "https://github.com/advisories/GHSA-86w9-cpqp-85rv",
    nodes: ["node_modules/node-forge"],
  },
];

test("accepts only exact production findings covered by applied local patches", () => {
  assert.deepEqual(Object.keys(REVIEWED_ADVISORIES), []);
  assert.deepEqual(
    Object.keys(LOCAL_SECURITY_PATCHES).sort(),
    currentVulnerableAdvisories.map(({ id }) => id).sort(),
  );

  for (const advisory of currentVulnerableAdvisories) {
    const remediation = LOCAL_SECURITY_PATCHES[advisory.id];
    assert.equal(remediation.dependency, advisory.name);
    assert.deepEqual(remediation.allowedNodes, advisory.nodes);
    assert.equal(remediation.reviewBy, "2026-10-18");
    assert.ok(remediation.owner);
    assert.ok(remediation.reason);
    assert.ok(remediation.nextAction);
    assert.ok(remediation.scope);

    const result = evaluateAuditReport(
      reportFor({
        name: advisory.name,
        url: advisory.url,
        nodes: advisory.nodes,
      }),
      { root: repoRoot },
    );

    assert.equal(result.blocking.length, 0);
    assert.equal(result.reviewed.length, 0);
    assert.equal(result.patched.length, 1);
  }
});

test("blocks a local security patch if the applied source marker is absent", () => {
  const remediation = LOCAL_SECURITY_PATCHES["GHSA-VFJ7-8CJW-P6XM"];
  const root = mkdtempSync(join(tmpdir(), "streamer-patch-audit-"));
  try {
    const packagePath = join(root, remediation.packageJsonPath);
    const sourcePath = join(root, remediation.sourcePath);
    const patchPath = join(root, remediation.patchFile);
    mkdirSync(dirname(packagePath), { recursive: true });
    mkdirSync(dirname(sourcePath), { recursive: true });
    mkdirSync(dirname(patchPath), { recursive: true });
    writeFileSync(
      packagePath,
      JSON.stringify({ version: remediation.version }),
    );
    writeFileSync(sourcePath, "unpatched package source");
    writeFileSync(patchPath, "version-bound local patch");

    const result = evaluateAuditReport(
      reportFor({
        name: "braces",
        url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
      }),
      { root },
    );

    assert.equal(result.blocking.length, 1);
    assert.equal(result.patched.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("blocks a local security patch after its review date", () => {
  const result = evaluateAuditReport(
    reportFor({
      name: "braces",
      url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
    }),
    {
      now: new Date("2026-10-19T00:00:00.000Z"),
      root: repoRoot,
    },
  );

  assert.equal(result.blocking.length, 1);
  assert.equal(result.patched.length, 0);
});

test("blocks a reviewed advisory when its exception has no owner or removal plan", () => {
  for (const field of ["owner", "reason", "nextAction", "scope"]) {
    const exception = {
      ...historicalExceptions["GHSA-MH99-V99M-4GVG"],
      [field]: "",
    };
    const result = evaluateAuditReport(
      reportFor({
        name: "brace-expansion",
        url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
        nodes: ["node_modules/test-exclude/node_modules/brace-expansion"],
      }),
      {
        exceptions: { "GHSA-MH99-V99M-4GVG": exception },
        now: new Date("2026-07-28T00:00:00.000Z"),
      },
    );

    assert.equal(result.blocking.length, 1, `${field} must be required`);
    assert.equal(result.reviewed.length, 0, `${field} must be required`);
  }
});

test("blocks local patches on any additional production dependency path", () => {
  for (const advisory of currentVulnerableAdvisories) {
    const result = evaluateAuditReport(
      reportFor({
        name: advisory.name,
        url: advisory.url,
        nodes: [...advisory.nodes, `node_modules/unexpected/${advisory.name}`],
      }),
      { now: new Date("2026-10-04T00:00:00.000Z") },
    );

    assert.equal(result.blocking.length, 1);
    assert.equal(result.reviewed.length, 0);
    assert.equal(result.patched.length, 0);
  }
});

test("allows only the exact reviewed brace-expansion advisory before expiry", () => {
  const result = evaluateAuditReport(
    reportFor({
      name: "brace-expansion",
      url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
      nodes: ["node_modules/test-exclude/node_modules/brace-expansion"],
    }),
    {
      exceptions: historicalExceptions,
      now: new Date("2026-07-28T00:00:00.000Z"),
    },
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
    {
      exceptions: historicalExceptions,
      now: new Date("2026-10-01T00:00:00.000Z"),
    },
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
    {
      exceptions: historicalExceptions,
      now: new Date("2026-07-28T00:00:00.000Z"),
    },
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
      exceptions: historicalExceptions,
      now: new Date("2026-07-28T00:00:00.000Z"),
    },
  );

  assert.equal(result.blocking.length, 1);
});

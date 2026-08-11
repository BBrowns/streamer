import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createSpdxFromLockfile,
  parseArgs,
  parseSbomOutput,
  writeSbom,
} from "./release-sbom.mjs";

const spdx = {
  spdxVersion: "SPDX-2.3",
  name: "streamer@0.1.0",
  packages: [],
};

test("parses the supported SBOM formats", () => {
  assert.deepEqual(parseSbomOutput(JSON.stringify(spdx)), spdx);
  assert.deepEqual(
    parseSbomOutput(
      JSON.stringify({ bomFormat: "CycloneDX", components: [] }),
      "cyclonedx",
    ),
    { bomFormat: "CycloneDX", components: [] },
  );
});

test("rejects malformed or mismatched SBOM documents", () => {
  assert.throws(() => parseSbomOutput("not-json"), /invalid JSON/);
  assert.throws(
    () => parseSbomOutput(JSON.stringify({ bomFormat: "CycloneDX" })),
    /SPDX document/,
  );
  assert.throws(
    () =>
      parseSbomOutput(JSON.stringify({ spdxVersion: "SPDX-2.3" }), "cyclonedx"),
    /CycloneDX document/,
  );
});

test("writes a validated SBOM using the lockfile npm command", () => {
  const dir = mkdtempSync(join(tmpdir(), "streamer-sbom-"));
  const output = join(dir, "sbom.json");
  const calls = [];

  try {
    writeSbom(output, {
      spawn(command, args, options) {
        calls.push({ command, args, options });
        return { status: 0, stdout: JSON.stringify(spdx), stderr: "" };
      },
    });

    assert.deepEqual(calls[0].args.slice(-5), [
      "sbom",
      "--package-lock-only",
      "--sbom-format=spdx",
      "--sbom-type=application",
      "--omit=dev",
    ]);
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), spdx);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("falls back to the lockfile when npm rejects overridden ranges", () => {
  const document = createSpdxFromLockfile();
  assert.equal(document.spdxVersion, "SPDX-2.3");
  assert.ok(
    document.packages.some((pkg) => pkg.name === "@streamer/stream-server"),
  );
  assert.ok(
    createSpdxFromLockfile({ includeDev: true }).packages.some(
      (pkg) => pkg.name === "webtorrent",
    ),
  );
  assert.equal(
    new Set(document.packages.map((pkg) => pkg.SPDXID)).size,
    document.packages.length,
  );
  assert.ok(
    document.relationships.some(
      (relationship) => relationship.relationshipType === "DEPENDS_ON",
    ),
  );
});

test("parses release SBOM CLI options", () => {
  assert.deepEqual(
    parseArgs([
      "--output",
      "out.json",
      "--format",
      "cyclonedx",
      "--type",
      "library",
      "--include-dev",
    ]),
    {
      output: "out.json",
      format: "cyclonedx",
      type: "library",
      includeDev: true,
    },
  );
});

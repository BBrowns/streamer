import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createRcEvidence,
  failureBuckets,
  writeRcEvidence,
} from "./rc-evidence.mjs";

test("creates RC evidence without making a release-ready claim", () => {
  const content = createRcEvidence({
    now: new Date("2026-06-13T10:00:00.000Z"),
    env: {
      STREAMER_APP_VERSION: "1.2.3",
      STREAMER_GIT_SHA: "abcdef1234567890",
      STREAMER_BUILD_CHANNEL: "preview",
      STREAMER_BUILD_ENVIRONMENT: "production",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "BBrowns/streamer",
      GITHUB_RUN_ID: "123",
    },
  });

  assert.match(content, /Version \| 1\.2\.3/);
  assert.match(content, /Git SHA \| abcdef1234567890/);
  assert.match(content, /CI run \| https:\/\/github\.com\/BBrowns\/streamer\/actions\/runs\/123/);
  assert.match(content, /not a\s+release-ready claim/i);
  assert.match(content, /no_peers/);
  assert.match(content, /download_verification_failed/);
  assert.match(content, /No raw media URLs, magnets, tokens, info hashes/);
});

test("keeps the expected failure bucket taxonomy explicit", () => {
  assert.deepEqual(failureBuckets, [
    "no_peers",
    "timeout",
    "bridge_unavailable",
    "unsupported_codec",
    "remux_unavailable",
    "cast_unreachable",
    "download_verification_failed",
    "security_policy_blocked",
  ]);
});

test("writes the RC evidence artifact to disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "streamer-rc-evidence-"));
  const output = join(dir, "rc-evidence.md");

  try {
    const result = writeRcEvidence(output, {
      now: new Date("2026-06-13T10:00:00.000Z"),
      env: { STREAMER_GIT_SHA: "sha" },
    });

    assert.equal(result.absoluteOutput, output);
    assert.match(readFileSync(output, "utf8"), /# RC Evidence Bundle/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

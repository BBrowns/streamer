import assert from "node:assert/strict";
import test from "node:test";

import {
  createQaRunManifest,
  parseArgs,
  preflightSurfaceForQa,
  renderQaRunMarkdown,
} from "./qa-run.mjs";

test("parses a reproducible QA run invocation", () => {
  assert.deepEqual(
    parseArgs([
      "--surface",
      "electron",
      "--scenario",
      "fallback",
      "--label",
      "home-network",
    ]),
    {
      surface: "electron",
      scenario: "fallback",
      label: "home-network",
      outputDir: "artifacts/qa-runs",
      json: false,
    },
  );
});

test("keeps startup, playback, and device claims separate", () => {
  const manifest = createQaRunManifest({
    runId: "2026-09-16-test",
    surface: "electron",
    scenario: "playback",
    label: "fixture",
    revision: "a".repeat(40),
    branch: "codex/test",
    preflight: { status: "passed", checks: [] },
  });

  assert.equal(manifest.claims.startup, "supported");
  assert.equal(manifest.claims.playback, "not-run");
  assert.equal(manifest.claims.realDevice, "not-run");
  assert.ok(manifest.steps.every((step) => step.status));

  const markdown = renderQaRunMarkdown(manifest);
  assert.match(markdown, /Playback: not-run/);
  assert.match(markdown, /Preflight/);
  assert.doesNotMatch(markdown, /magnet:|infoHash|token=|postgresql:/i);
});

test("maps UI and web QA runs to the UI-only preflight surface", () => {
  assert.equal(preflightSurfaceForQa("ui"), "ui");
  assert.equal(preflightSurfaceForQa("web"), "ui");
  assert.equal(preflightSurfaceForQa("electron"), "playback");
});

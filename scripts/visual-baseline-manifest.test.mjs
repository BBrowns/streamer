import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  collectVisualBaselineManifest,
  visualBaselineFileNames,
} from "./visual-baseline-manifest.mjs";

function withBaselineDirectory(callback) {
  const directory = mkdtempSync(join(tmpdir(), "streamer-visual-baselines-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test("requires the exact non-empty visual baseline set and records provenance", () => {
  withBaselineDirectory((directory) => {
    for (const file of visualBaselineFileNames) {
      writeFileSync(join(directory, file), file);
    }
    mkdirSync(join(directory, "ignored-directory"));

    const manifest = collectVisualBaselineManifest(directory, {
      platform: "linux",
      sourceCommit: "fixture-commit",
    });

    assert.equal(manifest.expectedFileCount, 12);
    assert.equal(manifest.platform, "linux");
    assert.equal(manifest.sourceCommit, "fixture-commit");
    assert.equal(manifest.files.length, 12);
    assert.equal(manifest.files[0].sha256.length, 64);
  });
});

test("rejects an incomplete or unexpected visual baseline set", () => {
  withBaselineDirectory((directory) => {
    writeFileSync(join(directory, visualBaselineFileNames[0]), "");
    writeFileSync(join(directory, "unreviewed.png"), "pixels");

    assert.throws(
      () => collectVisualBaselineManifest(directory),
      /Visual baseline set is invalid .*missing:.*unexpected:/,
    );
  });
});

test("rejects an empty screenshot even when every expected name exists", () => {
  withBaselineDirectory((directory) => {
    for (const file of visualBaselineFileNames) {
      writeFileSync(
        join(directory, file),
        file === visualBaselineFileNames[0] ? "" : "pixels",
      );
    }

    assert.throws(
      () => collectVisualBaselineManifest(directory),
      /not a non-empty regular file: home-dark-desktop-renderer\.png/,
    );
  });
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { mkdtemp, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("@playwright/test");

const workspaceRoot = path.resolve(__dirname, "..");
const defaultMacApp = path.join(
  workspaceRoot,
  "apps/desktop/release",
  process.arch === "x64" ? "mac-x64" : "mac-arm64",
  "Streamer.app",
  "Contents/MacOS/Streamer",
);

function resolvePackagedBinary() {
  const configuredPath = process.env.STREAMER_PACKAGED_APP?.trim();
  return configuredPath || defaultMacApp;
}

async function main() {
  const executablePath = resolvePackagedBinary();
  if (!fs.existsSync(executablePath)) {
    throw new Error(
      "Packaged renderer smoke requires a built macOS Streamer.app. Run npm run package:dir --workspace=@streamer/desktop first.",
    );
  }

  const userDataDir = await mkdtemp(
    path.join(os.tmpdir(), "streamer-packaged-renderer-smoke-"),
  );
  let electronApp;
  try {
    electronApp = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${userDataDir}`],
      timeout: 30_000,
    });
    const page = await electronApp.firstWindow();
    await page.waitForTimeout(5_000);
    const bodyText = (await page.locator("body").innerText()).trim();
    assert.ok(bodyText.length > 0, "Packaged renderer opened a blank window.");
    assert.doesNotMatch(bodyText, /^Unmatched Route/m);
    console.log(
      JSON.stringify({
        service: "streamer-packaged-renderer-smoke",
        event: "passed",
        renderer: "packaged-file",
        bodyCharacters: bodyText.length,
      }),
    );
  } finally {
    if (electronApp) {
      await electronApp
        .evaluate(({ app }) => {
          app.isQuiting = true;
          app.quit();
        })
        .catch(() => undefined);
      await electronApp.close().catch(() => undefined);
    }
    await rm(userDataDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[packaged-renderer-smoke] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { defaultMacApp, resolvePackagedBinary };

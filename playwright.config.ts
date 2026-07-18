import { defineConfig, devices } from "@playwright/test";

// Electron's hardened development allowlist intentionally accepts Metro only
// on its canonical 8081 port, so browser and real-shell evidence share it.
const port = Number(process.env.STREAMER_E2E_PORT || 8081);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  outputDir: "artifacts/playwright-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    // Pixel output is platform-specific. Keep independently reviewed Darwin
    // and Linux baselines so CI never compares Linux Chromium to a macOS image.
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixels: 500,
      threshold: 0.1,
      pathTemplate: "{testDir}/{testFilePath}-snapshots/{platform}/{arg}{ext}",
    },
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `CI=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:3001 npm run web --workspace=apps/mobile -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "phone-web",
      testMatch: /golden-path\/.*\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "tablet-portrait-web",
      testMatch: /golden-path\/.*\.spec\.ts/,
      use: {
        browserName: "chromium",
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "tablet-landscape-web",
      testMatch: /golden-path\/.*\.spec\.ts/,
      use: {
        browserName: "chromium",
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: "desktop-renderer",
      testMatch: /golden-path\/.*\.spec\.ts/,
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "electron-smoke",
      testMatch: /electron-smoke\/.*\.spec\.ts/,
    },
  ],
});

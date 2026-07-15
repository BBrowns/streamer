import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";
import { installGoldenPathRoutes } from "../golden-path/fixtures";

const workspaceRoot = resolve(__dirname, "../..");
const rendererPort = Number(process.env.STREAMER_E2E_PORT || 8081);
const rendererUrl = `http://127.0.0.1:${rendererPort}`;
const mainEntry = join(workspaceRoot, "apps/desktop/src/main.js");

function stringEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

test("real Electron main/preload reports versions, inspects media and survives zoom", async ({}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(
    rendererPort !== 8081,
    "The hardened desktop development origin intentionally permits only port 8081.",
  );
  test.skip(
    process.platform === "linux" && !process.env.DISPLAY,
    "A real Electron renderer requires Xvfb or another display on Linux.",
  );

  const isolatedUserData = await mkdtemp(
    join(tmpdir(), "streamer-electron-smoke-"),
  );
  const electronApp = await electron.launch({
    args: [mainEntry, `--user-data-dir=${isolatedUserData}`],
    env: {
      ...stringEnvironment(),
      NODE_ENV: "test",
      STREAMER_BUILD_CHANNEL: "qa-smoke",
      STREAMER_BUILD_DATE: "2026-07-15T00:00:00.000Z",
      STREAMER_DESKTOP_RENDERER_URL: rendererUrl,
      STREAMER_DESKTOP_SMOKE_DISABLE_BRIDGE: "true",
      STREAMER_GIT_SHA: "abcdef1234567890",
    },
    timeout: 45_000,
  });

  try {
    const page = await electronApp.firstWindow();
    await installGoldenPathRoutes(page, "direct");
    await page.addInitScript(() => {
      window.localStorage.setItem("HAS_SEEN_ONBOARDING", "true");
      window.localStorage.setItem(
        "auth-storage",
        JSON.stringify({
          state: {
            user: {
              id: "fixture-user",
              email: "qa@example.test",
              displayName: "QA Viewer",
              createdAt: "2026-01-01T00:00:00.000Z",
              emailVerified: true,
            },
            deviceId: "electron-smoke-device",
            isAuthenticated: true,
            biometricEnabled: false,
            backendUrl: null,
            streamServerUrl: null,
            theme: "system",
            pendingAddonUrls: [],
            lastActiveAt: null,
          },
          version: 0,
        }),
      );
      window.localStorage.setItem(
        "streamer.accessToken",
        "fixture-access-token",
      );
      window.localStorage.setItem(
        "streamer.refreshToken",
        "fixture-refresh-token",
      );
      window.localStorage.setItem(
        "streamer.tokenExpiresAt",
        String(Date.now() + 60 * 60 * 1000),
      );
    });
    await page.goto(`${rendererUrl}/settings/about`);
    await expect(page.getByTestId("settings-detail-about")).toBeVisible();

    const electronVersion = await electronApp.evaluate(
      ({ app }) => process.versions.electron || app.getVersion(),
    );
    await expect(page.getByTestId("about-desktop-version")).toContainText(
      "0.1.0",
    );
    await expect(page.getByTestId("about-electron-version")).toContainText(
      electronVersion,
    );
    await expect(page.getByTestId("about-build-sha")).toContainText(
      "abcdef123456",
    );
    await expect(page.getByTestId("about-build-channel")).toContainText(
      "qa-smoke",
    );

    const electronUserData = await electronApp.evaluate(({ app }) =>
      app.getPath("userData"),
    );
    const mediaPath = join(
      electronUserData,
      "offline_media",
      "verified-smoke.mp4",
    );
    await mkdir(dirname(mediaPath), { recursive: true });
    const mediaBytes = Buffer.alloc(1024 * 1024 + 17, 0x5a);
    await writeFile(mediaPath, mediaBytes);
    const mediaUrl = pathToFileURL(mediaPath);
    const localUri = `streamer://${mediaUrl.pathname}`;

    const inspection = await page.evaluate(async (uri) => {
      const bridge = (
        window as typeof window & {
          desktopBridge?: {
            inspectFile?: (localUri: string) => Promise<{
              exists: boolean;
              isFile: boolean;
              sizeBytes: number;
            }>;
          };
        }
      ).desktopBridge;
      if (!bridge?.inspectFile) throw new Error("inspectFile bridge missing");
      return bridge.inspectFile(uri);
    }, localUri);
    expect(inspection).toEqual({
      exists: true,
      isFile: true,
      sizeBytes: mediaBytes.byteLength,
    });

    for (const zoomFactor of [1.25, 1.5]) {
      await electronApp.evaluate(({ BrowserWindow }, factor) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (!window) throw new Error("Streamer BrowserWindow missing");
        window.webContents.setZoomFactor(factor);
      }, zoomFactor);
      await expect
        .poll(() =>
          electronApp.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor(),
          ),
        )
        .toBeCloseTo(zoomFactor, 2);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(
        dimensions.clientWidth + 1,
      );
      await page.screenshot({
        path: testInfo.outputPath(
          `electron-about-${Math.round(zoomFactor * 100)}.png`,
        ),
        fullPage: true,
        animations: "disabled",
      });
    }
  } finally {
    await electronApp
      .evaluate(({ app }) => {
        (app as typeof app & { isQuiting?: boolean }).isQuiting = true;
        app.quit();
      })
      .catch(() => undefined);
    await electronApp.close().catch(() => undefined);
    await rm(isolatedUserData, { recursive: true, force: true });
  }
});

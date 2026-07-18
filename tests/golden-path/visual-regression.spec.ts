import { existsSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { installGoldenPathRoutes } from "./fixtures";

const visualProjects = new Set(["phone-web", "desktop-renderer"]);
const visualBaselineUpdateEnabled =
  process.env.STREAMER_VISUAL_BASELINES === "1";

const screenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const,
  fullPage: true,
  scale: "css" as const,
};

function snapshotNames(scheme: "dark" | "light", projectName: string) {
  return [
    `home-${scheme}-${projectName}.png`,
    `settings-overview-${scheme}-${projectName}.png`,
    `search-results-${scheme}-${projectName}.png`,
  ];
}

function hasApprovedPlatformBaselines(
  testInfo: TestInfo,
  scheme: "dark" | "light",
) {
  return snapshotNames(scheme, testInfo.project.name).every((name) =>
    existsSync(testInfo.snapshotPath(name, { kind: "screenshot" })),
  );
}

function skipUnsupportedVisualEnvironment(
  testInfo: TestInfo,
  scheme: "dark" | "light",
) {
  test.skip(
    !visualProjects.has(testInfo.project.name),
    "Visual baselines cover the compact and large window classes; semantic golden paths cover the intermediate layouts.",
  );
  test.skip(
    !visualBaselineUpdateEnabled && process.platform !== "linux",
    "Run platform-specific visual baselines deliberately with STREAMER_VISUAL_BASELINES=1 outside Linux CI.",
  );
}

async function settleVisualFrame(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) =>
        image.decode().catch(() => undefined),
      ),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function loginToFixtureShell(page: Page, scheme: "dark" | "light") {
  await installGoldenPathRoutes(page, "direct");
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.localStorage.setItem("HAS_SEEN_ONBOARDING", "true");
  });
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("qa@example.test");
  await page.getByPlaceholder("Password").fill("fixture-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("home-screen")).toBeVisible();
  await settleVisualFrame(page);
}

for (const scheme of ["dark", "light"] as const) {
  test(`matches the ${scheme} Home, Settings, and Search visual baselines`, async ({
    page,
  }, testInfo) => {
    skipUnsupportedVisualEnvironment(testInfo, scheme);

    // Linux is the CI evidence platform. Once the bootstrap artifact has been
    // reviewed and committed, its baseline must stay complete; a missing image
    // is a failure rather than a silently skipped visual check.
    if (!visualBaselineUpdateEnabled && process.platform === "linux") {
      expect(
        hasApprovedPlatformBaselines(testInfo, scheme),
        "Every Linux visual baseline must be reviewed and committed before CI can pass.",
      ).toBe(true);
    }

    await loginToFixtureShell(page, scheme);

    await expect(page.getByTestId("home-hero")).toBeVisible();
    await expect(page).toHaveScreenshot(
      `home-${scheme}-${testInfo.project.name}.png`,
      screenshotOptions,
    );

    await page.goto("/settings");
    await expect(page.getByTestId("settings-screen")).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `settings-overview-${scheme}-${testInfo.project.name}.png`,
      screenshotOptions,
    );

    await page.goto("/search?q=Golden");
    await expect(page.getByTestId("search-results-grid")).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `search-results-${scheme}-${testInfo.project.name}.png`,
      screenshotOptions,
    );
  });
}

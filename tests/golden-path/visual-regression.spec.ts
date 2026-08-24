import { existsSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { FIXTURE_MOVIE_ID, type GoldenPathScenario } from "./fixtures";
import {
  deterministicScreenshotOptions,
  loginToFixtureShell,
  settleVisualFrame,
} from "./ui-test-helpers";

const visualProjects = new Set(["phone-web", "desktop-renderer"]);
const visualBaselineUpdateEnabled =
  process.env.STREAMER_VISUAL_BASELINES === "1";

function snapshotNames(scheme: "dark" | "light", projectName: string) {
  const names = [
    `addons-install-success-${scheme}-${projectName}.png`,
    `detail-actions-${scheme}-${projectName}.png`,
    `downloads-mixed-${scheme}-${projectName}.png`,
    `home-${scheme}-${projectName}.png`,
    `login-${scheme}-${projectName}.png`,
    `notifications-populated-${scheme}-${projectName}.png`,
    `onboarding-setup-${scheme}-${projectName}.png`,
    `settings-overview-${scheme}-${projectName}.png`,
    `search-results-${scheme}-${projectName}.png`,
  ];
  if (scheme === "dark" && projectName === "phone-web") {
    names.push(
      "player-dark-phone-web.png",
      "player-scrubbing-preview-dark-phone-web.png",
      "player-subtitle-sheet-dark-phone-web.png",
      "player-actionable-fallback-dark-phone-web.png",
    );
  }
  if (scheme === "dark" && projectName === "desktop-renderer") {
    names.push(
      "player-dark-desktop-renderer.png",
      "player-hover-preview-dark-desktop-renderer.png",
      "player-settings-popover-dark-desktop-renderer.png",
      "player-progressive-nonseekable-dark-desktop-renderer.png",
    );
  }
  return names;
}

function requireLinuxBaselines(testInfo: TestInfo, scheme: "dark" | "light") {
  if (!visualBaselineUpdateEnabled && process.platform === "linux") {
    expect(
      hasApprovedPlatformBaselines(testInfo, scheme),
      "Every Linux visual baseline must be reviewed and committed before CI can pass.",
    ).toBe(true);
  }
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

async function openFixturePlayer(
  page: Page,
  scenario: GoldenPathScenario = "direct-visual",
) {
  await loginToFixtureShell(page, { colorScheme: "dark", scenario });
  await page
    .getByTestId("home-hero")
    .getByRole("button", { name: "View details" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/detail/movie/${FIXTURE_MOVIE_ID}$`),
  );
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/player$/);
}

for (const scheme of ["dark", "light"] as const) {
  test(`matches the ${scheme} Home, Settings, and Search visual baselines`, async ({
    page,
  }, testInfo) => {
    skipUnsupportedVisualEnvironment(testInfo, scheme);

    requireLinuxBaselines(testInfo, scheme);

    await loginToFixtureShell(page, { colorScheme: scheme });

    await expect(page.getByTestId("home-hero")).toBeVisible();
    await expect(page).toHaveScreenshot(
      `home-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );

    await page.goto("/settings");
    await expect(page.getByTestId("settings-screen")).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `settings-overview-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );

    await page.goto("/search?q=Golden");
    await expect(page.getByTestId("search-results-grid")).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `search-results-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
  });

  test(`matches the ${scheme} Login and onboarding visual baselines`, async ({
    page,
  }, testInfo) => {
    skipUnsupportedVisualEnvironment(testInfo, scheme);
    requireLinuxBaselines(testInfo, scheme);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/login");
    await expect(page.getByText("Welcome Back", { exact: true })).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `login-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
    await page.goto("/onboarding/setup");
    await expect(page.getByText("Personalize", { exact: true })).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `onboarding-setup-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
  });

  test(`matches the ${scheme} populated Notifications, installed Add-ons, and Detail actions`, async ({
    page,
  }, testInfo) => {
    skipUnsupportedVisualEnvironment(testInfo, scheme);
    requireLinuxBaselines(testInfo, scheme);
    await loginToFixtureShell(page, {
      colorScheme: scheme,
      fixture: { addonInstall: "succeeds", notifications: "populated" },
      fixedTime: "2026-07-18T15:00:00.000Z",
    });
    await page.goto("/notifications");
    await expect(page.getByTestId("notifications-list")).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `notifications-populated-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
    await page.goto("/addons");
    await expect(page.getByTestId("addons-screen")).toBeVisible();
    await page
      .getByLabel("Manifest URL")
      .fill("https://fixture.example.test/recommendations.json");
    await page.getByRole("button", { name: "Install" }).click();
    await expect(
      page.getByText("New content will appear on Discover.", { exact: true }),
    ).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `addons-install-success-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
    await page.goto("/");
    await expect(page.getByTestId("home-hero")).toBeVisible();
    await page
      .getByTestId("home-hero")
      .getByRole("button", { name: "View details" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/detail/movie/${FIXTURE_MOVIE_ID}$`),
    );
    for (const label of [
      "Play",
      "Download",
      "Cast to device",
      "Add to Library",
    ]) {
      await expect(
        page.getByRole("button", { name: label, exact: true }),
      ).toBeVisible();
    }
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `detail-actions-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
  });

  test(`matches the ${scheme} mixed Downloads visual baseline`, async ({
    page,
  }, testInfo) => {
    skipUnsupportedVisualEnvironment(testInfo, scheme);
    requireLinuxBaselines(testInfo, scheme);
    await loginToFixtureShell(page, {
      colorScheme: scheme,
      downloads: "mixed",
    });
    await page.goto("/downloads");
    await expect(
      page.getByText("Fixture in progress", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Fixture ready offline", { exact: true }),
    ).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `downloads-mixed-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
  });
}

test("matches the dark player, timeline preview, and settings baselines", async ({
  page,
}, testInfo) => {
  skipUnsupportedVisualEnvironment(testInfo, "dark");
  requireLinuxBaselines(testInfo, "dark");

  await openFixturePlayer(page);
  await expect(page.getByTestId("player-screen")).toBeVisible();
  await expect(page.locator("video")).toBeVisible();
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.isVisible()) {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await page.keyboard.press("k");
  }
  const playControl = page.getByRole("button", { name: "Play playback" });
  await expect(playControl).toBeVisible();
  const settleUnfocusedPlayerFrame = async () => {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await settleVisualFrame(page);
    await expect(playControl).not.toBeFocused();
    await expect(playControl).toHaveCSS("outline-style", "none");
  };
  const video = page.locator("video");
  const timeline = page.getByTestId("player-progress-slider");
  const watchedTimeline = page.getByTestId("player-timeline-watched");
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).paused),
    )
    .toBe(true);

  // Drive the same seek boundary as a keyboard user. Mutating the DOM video
  // directly can leave expo-video's accepted clock (and therefore the rendered
  // playhead) on an older value, which made this short fixture nondeterministic
  // across otherwise identical Linux jobs.
  await timeline.focus();
  await timeline.press("Home");
  await expect(watchedTimeline).toHaveAttribute("style", /width:\s*0%;/);
  // The accepted-clock update can outlive the normal chrome timeout on a slow
  // CI runner. Re-issuing the idempotent seek makes the intended visible state
  // explicit immediately before capture.
  await timeline.press("Home");
  await expect(page.getByTestId("player-close-button")).toBeVisible();
  const playerBox = await page.getByTestId("player-screen").boundingBox();
  expect(playerBox).not.toBeNull();
  await page.mouse.move(
    playerBox!.x + playerBox!.width / 2,
    playerBox!.y + playerBox!.height * 0.2,
  );
  await settleUnfocusedPlayerFrame();
  await expect(page).toHaveScreenshot(
    `player-dark-${testInfo.project.name}.png`,
    deterministicScreenshotOptions,
  );

  const timelineBox = await timeline.boundingBox();
  expect(timelineBox).not.toBeNull();
  await page.mouse.move(
    timelineBox!.x + timelineBox!.width * 0.64,
    timelineBox!.y + timelineBox!.height / 2,
  );
  await expect(page.getByTestId("player-timeline-preview")).toBeVisible();
  await settleUnfocusedPlayerFrame();
  const previewSnapshotName =
    testInfo.project.name === "phone-web"
      ? "player-scrubbing-preview-dark-phone-web.png"
      : "player-hover-preview-dark-desktop-renderer.png";
  // This frame is already settled above. Comparing the direct buffer avoids
  // toHaveScreenshot's stabilization loop reintroducing the prior button
  // focus style while it takes repeated captures.
  expect(await page.screenshot(deterministicScreenshotOptions)).toMatchSnapshot(
    previewSnapshotName,
    {
      maxDiffPixels: 500,
      threshold: 0.1,
    },
  );

  await page.getByRole("button", { name: "Playback settings" }).click();
  await expect(page.getByTestId("player-settings-sheet")).toBeVisible();
  await page.getByRole("tab", { name: "Subtitles" }).click();
  await expect(
    page.getByRole("button", { name: "Reset subtitle style" }),
  ).toBeVisible();
  await settleVisualFrame(page);
  await expect(page).toHaveScreenshot(
    testInfo.project.name === "phone-web"
      ? "player-subtitle-sheet-dark-phone-web.png"
      : "player-settings-popover-dark-desktop-renderer.png",
    deterministicScreenshotOptions,
  );
});

test("matches the dark player recovery and non-seekable baselines", async ({
  page,
}, testInfo) => {
  skipUnsupportedVisualEnvironment(testInfo, "dark");
  requireLinuxBaselines(testInfo, "dark");

  if (testInfo.project.name === "phone-web") {
    await openFixturePlayer(page, "no-peers");
    await expect(page.getByText("No Peers Found")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Choose another source" }),
    ).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      "player-actionable-fallback-dark-phone-web.png",
      deterministicScreenshotOptions,
    );
    return;
  }

  await openFixturePlayer(page, "progressive-nonseekable");
  await expect(page.getByTestId("player-screen")).toBeVisible();
  await expect(
    page.getByRole("slider", {
      name: "Playback progress unavailable",
    }),
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    page.getByText(
      "Preparing seek controls in the background. Playback can continue while this finishes.",
    ),
  ).toBeVisible();
  await settleVisualFrame(page);
  await expect(page).toHaveScreenshot(
    "player-progressive-nonseekable-dark-desktop-renderer.png",
    deterministicScreenshotOptions,
  );
});

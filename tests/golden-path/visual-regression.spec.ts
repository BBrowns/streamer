import { existsSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { FIXTURE_MOVIE_ID, type GoldenPathScenario } from "./fixtures";
import {
  deterministicScreenshotOptions,
  attachGauntletVisualCase,
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
    !visualBaselineUpdateEnabled &&
      process.platform !== "linux" &&
      !process.env.STREAMER_GAUNTLET_VISUAL_CASES,
    "Run platform-specific visual baselines deliberately with STREAMER_VISUAL_BASELINES=1 outside Linux CI.",
  );
}

function skipUnlessRequestedVisualCase(testInfo: TestInfo, surfaces: string[]) {
  const requested = new Set(
    (process.env.STREAMER_GAUNTLET_VISUAL_CASES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (requested.size === 0) return;
  const target =
    testInfo.project.name === "phone-web"
      ? "phone"
      : testInfo.project.name === "desktop-renderer"
        ? "desktop"
        : null;
  test.skip(
    !target ||
      !surfaces.some((surface) => requested.has(`${surface}-${target}`)),
    "This Playwright case does not provide a requested stable visual case ID.",
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

async function emulatePublishedTimelineRanges(page: Page) {
  await page.addInitScript(() => {
    const ranges = (values: Array<[number, number]>) =>
      ({
        length: values.length,
        start(index: number) {
          if (!values[index]) throw new DOMException("Invalid range index");
          return values[index][0];
        },
        end(index: number) {
          if (!values[index]) throw new DOMException("Invalid range index");
          return values[index][1];
        },
      }) as TimeRanges;
    const buffered = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "buffered",
    );
    const seekable = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "seekable",
    );
    if (!buffered?.get || !seekable?.get) return;

    Object.defineProperty(HTMLMediaElement.prototype, "buffered", {
      configurable: true,
      get() {
        if (this.currentSrc.endsWith("/golden-path.webm")) {
          return ranges([[0, 300]]);
        }
        return buffered.get?.call(this);
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "seekable", {
      configurable: true,
      get() {
        if (this.currentSrc.endsWith("/golden-path.webm")) {
          return ranges([[0, 7_200]]);
        }
        return seekable.get?.call(this);
      },
    });
  });
}

for (const scheme of ["dark", "light"] as const) {
  test(`matches the ${scheme} Home, Settings, and Search visual baselines`, async ({
    page,
  }, testInfo) => {
    skipUnsupportedVisualEnvironment(testInfo, scheme);
    skipUnlessRequestedVisualCase(testInfo, ["home", "settings", "search"]);

    requireLinuxBaselines(testInfo, scheme);

    await loginToFixtureShell(page, { colorScheme: scheme });

    await expect(page.getByTestId("home-hero")).toBeVisible();
    await expect(page).toHaveScreenshot(
      `home-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
    await attachGauntletVisualCase(page, testInfo, "home", scheme);

    await page.goto("/settings");
    await expect(page.getByTestId("settings-screen")).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `settings-overview-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
    await attachGauntletVisualCase(page, testInfo, "settings", scheme);

    await page.goto("/search?q=Golden");
    await expect(page.getByTestId("search-results-grid")).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `search-results-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
    await attachGauntletVisualCase(page, testInfo, "search", scheme);
  });

  test(`matches the ${scheme} Login and onboarding visual baselines`, async ({
    page,
  }, testInfo) => {
    skipUnsupportedVisualEnvironment(testInfo, scheme);
    skipUnlessRequestedVisualCase(testInfo, ["login", "onboarding"]);
    requireLinuxBaselines(testInfo, scheme);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/login");
    await expect(page.getByText("Welcome Back", { exact: true })).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `login-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
    await attachGauntletVisualCase(page, testInfo, "login", scheme);
    await page.goto("/onboarding/setup");
    await expect(page.getByText("Personalize", { exact: true })).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `onboarding-setup-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
    await attachGauntletVisualCase(page, testInfo, "onboarding", scheme);
  });

  test(`matches the ${scheme} populated Notifications, installed Add-ons, and Detail actions`, async ({
    page,
  }, testInfo) => {
    skipUnsupportedVisualEnvironment(testInfo, scheme);
    skipUnlessRequestedVisualCase(testInfo, [
      "notifications",
      "addons",
      "detail",
    ]);
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
    await attachGauntletVisualCase(page, testInfo, "notifications", scheme);
    await page.goto("/addons");
    await expect(page.getByTestId("addons-screen")).toBeVisible();
    await page
      .getByLabel("Manifest URL")
      .fill("https://fixture.example.test/recommendations.json");
    await page.getByRole("button", { name: "Install" }).click();
    await expect(
      page.getByText("You can now browse and search this content.", {
        exact: true,
      }),
    ).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      `addons-install-success-${scheme}-${testInfo.project.name}.png`,
      deterministicScreenshotOptions,
    );
    await attachGauntletVisualCase(page, testInfo, "addons", scheme);
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
    await attachGauntletVisualCase(page, testInfo, "detail", scheme);
  });

  test(`matches the ${scheme} mixed Downloads visual baseline`, async ({
    page,
  }, testInfo) => {
    skipUnsupportedVisualEnvironment(testInfo, scheme);
    skipUnlessRequestedVisualCase(testInfo, ["downloads"]);
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
    await attachGauntletVisualCase(page, testInfo, "downloads", scheme);
  });
}

test("captures Library evidence for its stable visual case IDs", async ({
  page,
}, testInfo) => {
  skipUnsupportedVisualEnvironment(testInfo, "dark");
  skipUnlessRequestedVisualCase(testInfo, ["library"]);
  await loginToFixtureShell(page, { colorScheme: "dark" });
  await page.goto("/library");
  await expect(
    page.locator('[data-testid^="library-card-library:"]'),
  ).toHaveCount(9);
  await settleVisualFrame(page);
  await attachGauntletVisualCase(page, testInfo, "library", "dark");
});

test("matches the dark player, timeline preview, and settings baselines", async ({
  page,
}, testInfo) => {
  skipUnsupportedVisualEnvironment(testInfo, "dark");
  skipUnlessRequestedVisualCase(testInfo, ["player"]);
  requireLinuxBaselines(testInfo, "dark");

  await emulatePublishedTimelineRanges(page);
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
  const playPauseControl = page.getByRole("button", {
    name: /^(Play|Pause) playback$/,
  });
  await expect(playPauseControl).toBeVisible();
  const settleUnfocusedPlayerFrame = async () => {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await settleVisualFrame(page);
    await expect(playPauseControl).not.toBeFocused();
    await expect(playPauseControl).toHaveCSS("outline-style", "none");
  };
  const video = page.locator("video");
  const timeline = page.getByTestId("player-progress-slider");
  const watchedTimeline = page.getByTestId("player-timeline-watched");
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).paused),
    )
    .toBe(true);
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).duration),
    )
    .toBe(7_200);
  await expect(page.getByText("2:00:00", { exact: true })).toBeVisible();
  await expect(
    page.locator('[data-testid^="player-timeline-seekable-"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-testid^="player-timeline-buffered"]'),
  ).toHaveCount(1);
  const seekableWidth = await page
    .getByTestId("player-timeline-seekable-0")
    .evaluate((element) => element.getBoundingClientRect().width);
  const bufferedWidth = await page
    .getByTestId("player-timeline-buffered")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(seekableWidth).toBeGreaterThan(bufferedWidth * 10);

  // Drive the same seek boundary as a keyboard user. Mutating the DOM video
  // directly can leave expo-video's accepted clock (and therefore the rendered
  // playhead) on an older value, which makes the rendered state nondeterministic
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
  await attachGauntletVisualCase(page, testInfo, "player", "dark");

  const timelineBox = await timeline.boundingBox();
  expect(timelineBox).not.toBeNull();
  await page.mouse.move(
    timelineBox!.x + timelineBox!.width * 0.64,
    timelineBox!.y + timelineBox!.height / 2,
  );
  await expect(page.getByTestId("player-timeline-preview")).toBeVisible();
  await expect(page.getByText(/^1:16:\d{2}$/).first()).toBeVisible();
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
  await attachGauntletVisualCase(page, testInfo, "player", "dark");

  await page.getByRole("button", { name: "Playback settings" }).click();
  await expect(page.getByTestId("player-settings-sheet")).toBeVisible();
  await page.getByRole("tab", { name: "Subtitles" }).click();
  await expect(
    page.getByRole("button", { name: "Reset subtitle style" }),
  ).toBeVisible();
  const settingsSheet = page.getByTestId("player-settings-sheet");
  const settingsBounds = await settingsSheet.boundingBox();
  expect(settingsBounds).not.toBeNull();
  const opacityOptions = page.locator('[aria-label^="Background opacity:"]');
  await expect(opacityOptions).toHaveCount(4);
  for (const option of await opacityOptions.all()) {
    const optionBounds = await option.boundingBox();
    expect(optionBounds).not.toBeNull();
    expect(optionBounds!.y).toBeGreaterThanOrEqual(settingsBounds!.y);
    expect(optionBounds!.y + optionBounds!.height).toBeLessThanOrEqual(
      settingsBounds!.y + settingsBounds!.height,
    );
  }
  if (testInfo.project.name === "phone-web") {
    const lastOpacityBounds = await opacityOptions.last().boundingBox();
    expect(lastOpacityBounds).not.toBeNull();
    expect(
      settingsBounds!.y +
        settingsBounds!.height -
        (lastOpacityBounds!.y + lastOpacityBounds!.height),
    ).toBeGreaterThanOrEqual(24);
  }
  await settleVisualFrame(page);
  await expect(page).toHaveScreenshot(
    testInfo.project.name === "phone-web"
      ? "player-subtitle-sheet-dark-phone-web.png"
      : "player-settings-popover-dark-desktop-renderer.png",
    deterministicScreenshotOptions,
  );
  await attachGauntletVisualCase(page, testInfo, "player", "dark");
  if (testInfo.project.name === "phone-web") {
    const resetButton = page.getByRole("button", {
      name: "Reset subtitle style",
    });
    await resetButton.scrollIntoViewIfNeeded();
    await expect(resetButton).toBeInViewport();
  }
});

test("matches the dark player recovery and non-seekable baselines", async ({
  page,
}, testInfo) => {
  skipUnsupportedVisualEnvironment(testInfo, "dark");
  skipUnlessRequestedVisualCase(testInfo, ["player"]);
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

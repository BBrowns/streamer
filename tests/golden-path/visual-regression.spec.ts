import { existsSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  FIXTURE_MOVIE_ID,
  installGoldenPathRoutes,
  type GoldenPathScenario,
} from "./fixtures";

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
  const names = [
    `home-${scheme}-${projectName}.png`,
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
      "player-inspect-sheet-dark-desktop-renderer.png",
      "player-progressive-nonseekable-dark-desktop-renderer.png",
    );
  }
  return names;
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

async function loginToFixtureShell(
  page: Page,
  scheme: "dark" | "light",
  scenario: GoldenPathScenario = "direct",
) {
  await installGoldenPathRoutes(page, scenario);
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

async function openFixturePlayer(
  page: Page,
  scenario: GoldenPathScenario = "direct-visual",
) {
  await loginToFixtureShell(page, "dark", scenario);
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

test("matches the dark player, timeline preview, and settings baselines", async ({
  page,
}, testInfo) => {
  skipUnsupportedVisualEnvironment(testInfo, "dark");
  if (!visualBaselineUpdateEnabled && process.platform === "linux") {
    expect(
      hasApprovedPlatformBaselines(testInfo, "dark"),
      "Every Linux player baseline must be reviewed and committed before CI can pass.",
    ).toBe(true);
  }

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
    screenshotOptions,
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
  expect(await page.screenshot(screenshotOptions)).toMatchSnapshot(
    previewSnapshotName,
    {
      maxDiffPixels: 500,
      threshold: 0.1,
    },
  );

  await page
    .getByRole("button", { name: "Audio, subtitles, and source" })
    .click();
  await expect(page.getByTestId("player-settings-sheet")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reset subtitle style" }),
  ).toBeVisible();
  await settleVisualFrame(page);
  await expect(page).toHaveScreenshot(
    testInfo.project.name === "phone-web"
      ? "player-subtitle-sheet-dark-phone-web.png"
      : "player-inspect-sheet-dark-desktop-renderer.png",
    screenshotOptions,
  );
});

test("matches the dark player recovery and non-seekable baselines", async ({
  page,
}, testInfo) => {
  skipUnsupportedVisualEnvironment(testInfo, "dark");
  if (!visualBaselineUpdateEnabled && process.platform === "linux") {
    expect(
      hasApprovedPlatformBaselines(testInfo, "dark"),
      "Every Linux player state baseline must be reviewed and committed before CI can pass.",
    ).toBe(true);
  }

  if (testInfo.project.name === "phone-web") {
    await openFixturePlayer(page, "no-peers");
    await expect(page.getByText("No Peers Found")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Choose another source" }),
    ).toBeVisible();
    await settleVisualFrame(page);
    await expect(page).toHaveScreenshot(
      "player-actionable-fallback-dark-phone-web.png",
      screenshotOptions,
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
    screenshotOptions,
  );
});

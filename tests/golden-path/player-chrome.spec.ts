import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { FIXTURE_MOVIE_ID } from "./fixtures";
import {
  attachGauntletVisualCase,
  deterministicScreenshotOptions,
  loginToFixtureShell,
} from "./ui-test-helpers";

const supportedProjects = new Set(["phone-web", "desktop-renderer"]);

function autoHideDelay(testInfo: TestInfo) {
  return testInfo.project.name === "phone-web" ? 3_000 : 2_500;
}

async function openPlayingFixture(page: Page) {
  // The direct fixture lasts only 520ms. Loop the real video so chrome tests
  // do not accidentally exercise the normal end-of-source recovery instead.
  await page.addInitScript(() => {
    const loopVideos = (element: Element) => {
      if (element instanceof HTMLVideoElement) element.loop = true;
      element.querySelectorAll("video").forEach(loopVideos);
    };
    document.querySelectorAll("video").forEach(loopVideos);
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) loopVideos(node);
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await loginToFixtureShell(page, { colorScheme: "dark" });
  await page
    .getByTestId("home-hero")
    .getByRole("button", { name: "View details" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/detail/movie/${FIXTURE_MOVIE_ID}$`),
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/\/player$/);
  await expect(page.getByTestId("player-screen")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pause playback" }),
  ).toBeVisible();
  await expectPlaying(page);
}

async function expectPlaying(page: Page) {
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate(
          (video: HTMLVideoElement) =>
            !video.paused && !video.ended && video.readyState >= 2,
        ),
    )
    .toBe(true);
}

async function moveOntoVideo(page: Page, offset = 0) {
  const screen = await page.getByTestId("player-screen").boundingBox();
  expect(screen).not.toBeNull();
  const point = {
    x: screen!.x + screen!.width / 2 + offset,
    y: screen!.y + screen!.height * 0.3,
  };
  await page.mouse.move(point.x, point.y);
  return point;
}

async function expectChromeVisible(page: Page) {
  await expect(page.getByTestId("player-top-chrome")).toBeVisible();
  await expect(page.getByTestId("player-controls-cinematic")).toBeVisible();
}

async function expectChromeHidden(page: Page) {
  await expect(page.getByTestId("player-top-chrome")).toBeHidden({
    timeout: 1_000,
  });
  await expect(page.getByTestId("player-controls-cinematic")).toBeHidden({
    timeout: 1_000,
  });
}

async function captureChrome(
  page: Page,
  testInfo: TestInfo,
  state: "visible" | "hidden",
) {
  const path = testInfo.outputPath(
    `player-chrome-${state}-${testInfo.project.name}.png`,
  );
  await page.screenshot({ ...deterministicScreenshotOptions, path });
  await testInfo.attach(`player-chrome-${state}`, {
    path,
    contentType: "image/png",
  });
  if (state === "visible") {
    await attachGauntletVisualCase(page, testInfo, "player", "dark");
  }
}

async function focusWithKeyboard(page: Page, target: Locator) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement))
      return;
  }
  throw new Error("The player control did not receive keyboard focus.");
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    !supportedProjects.has(testInfo.project.name),
    "Chrome QA uses compact and desktop viewports.",
  );
});

test("pointer-focused controls auto-hide, video clicks stay hidden, and movement reveals them", async ({
  page,
}, testInfo) => {
  await openPlayingFixture(page);
  // Clicking a real control leaves browser focus on it. That pointer focus
  // must not count as the keyboard focus that intentionally holds chrome open.
  await page.getByRole("button", { name: "Pause playback" }).click();
  await page.getByRole("button", { name: "Play playback" }).click();
  await expectPlaying(page);
  const point = await moveOntoVideo(page);
  await expectChromeVisible(page);
  await captureChrome(page, testInfo, "visible");
  await page.waitForTimeout(autoHideDelay(testInfo) + 250);
  await expectChromeHidden(page);
  await expectPlaying(page);
  await captureChrome(page, testInfo, "hidden");

  await moveOntoVideo(page, 12);
  await expectChromeVisible(page);
  await page.mouse.click(point.x, point.y);
  await expectChromeHidden(page);
  // A stale focus update must not immediately reopen controls after a click.
  await page.waitForTimeout(400);
  await expectChromeHidden(page);
  await expectPlaying(page);
  await moveOntoVideo(page, 24);
  await expectChromeVisible(page);
  await page.mouse.move(-10, -10);
  await page.waitForTimeout(autoHideDelay(testInfo) + 250);
  await expectChromeHidden(page);
  await expectPlaying(page);
});

test("keyboard focus holds chrome open until pointer interaction resumes", async ({
  page,
}, testInfo) => {
  await openPlayingFixture(page);
  const settings = page.getByTestId("player-settings-button");
  await focusWithKeyboard(page, settings);
  await expect(settings).toBeFocused();
  await page.waitForTimeout(autoHideDelay(testInfo) + 400);
  await expectChromeVisible(page);
  await expect(settings).toBeFocused();
  await expectPlaying(page);

  const point = await moveOntoVideo(page);
  await expectChromeVisible(page);
  await expect(settings).toBeFocused();
  await page.mouse.click(point.x, point.y);
  await expectChromeHidden(page);
  await moveOntoVideo(page, 12);
  await expectChromeVisible(page);
  await page.waitForTimeout(autoHideDelay(testInfo) + 250);
  await expectChromeHidden(page);
  await expectPlaying(page);
});

test("open playback settings keep chrome visible beyond the idle delay", async ({
  page,
}, testInfo) => {
  await openPlayingFixture(page);
  await page.getByTestId("player-settings-button").click();
  await expect(page.getByTestId("player-settings-sheet")).toBeVisible();
  await page.waitForTimeout(autoHideDelay(testInfo) + 400);
  await expectChromeVisible(page);
  await expect(page.getByTestId("player-settings-sheet")).toBeVisible();
  await expectPlaying(page);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByTestId("player-settings-sheet")).toBeHidden();
  await moveOntoVideo(page);
  await page.waitForTimeout(autoHideDelay(testInfo) + 250);
  await expectChromeHidden(page);
  await expectPlaying(page);
});

test("an accessible reveal action keeps controls available without requiring DOM focus", async ({
  page,
}, testInfo) => {
  await openPlayingFixture(page);
  await page.waitForTimeout(autoHideDelay(testInfo) + 250);
  await expectChromeHidden(page);
  const reveal = page.getByRole("button", { name: "Show playback controls" });
  await expect(reveal).toHaveCount(1);
  await expect(reveal).not.toBeFocused();
  // Model virtual-cursor activation without claiming actual assistive-tech QA.
  // This action must remain accessible even when the visible chrome is absent.
  await reveal.evaluate((element: HTMLElement) => element.click());
  await expectChromeVisible(page);
  await expect(page.getByTestId("player-play-pause-button")).toBeFocused();
  await page.waitForTimeout(autoHideDelay(testInfo) + 400);
  await expectChromeVisible(page);
  await expectPlaying(page);

  const point = await moveOntoVideo(page);
  await page.mouse.click(point.x, point.y);
  await expectChromeHidden(page);
});

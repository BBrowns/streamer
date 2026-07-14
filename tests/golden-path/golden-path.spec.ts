import { expect, test, type Page } from "@playwright/test";
import { playbackPlanRequestSchema } from "@streamer/shared";
import {
  FIXTURE_MOVIE_ID,
  installGoldenPathRoutes,
  type GoldenPathScenario,
} from "./fixtures";

async function loginAndOpenFixture(page: Page, scenario: GoldenPathScenario) {
  const controls = await installGoldenPathRoutes(page, scenario);
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("qa@example.test");
  await page.getByPlaceholder("Password").fill("fixture-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("home-screen")).toBeVisible();
  await expect.poll(controls.bridgeProbes).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Featured: Golden Path Adventure" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/detail/movie/${FIXTURE_MOVIE_ID}$`),
  );
  await expect(page.getByRole("button", { name: "Play Best" })).toBeEnabled();
  return controls;
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("authentication owns the viewport without duplicate navigation", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");

  await expect(page.getByText("Welcome Back", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Email")).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toBeVisible();
  await expect(page.getByText("Sign In", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Home" })).toHaveCount(0);
  await expectNoHorizontalPageOverflow(page);

  await page.screenshot({
    path: testInfo.outputPath(`login-${testInfo.project.name}.png`),
    fullPage: true,
    animations: "disabled",
  });
});

test("onboarding setup remains shell-free and responsive", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/onboarding/setup");

  await expect(page.getByText("Personalize", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish & Sign In" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Home" })).toHaveCount(0);
  await expectNoHorizontalPageOverflow(page);

  await page.screenshot({
    path: testInfo.outputPath(`onboarding-${testInfo.project.name}.png`),
    fullPage: true,
    animations: "disabled",
  });
});

test("browse to detail and Play Best reaches a direct player", async ({
  page,
}) => {
  const controls = await loginAndOpenFixture(page, "direct");
  await page.getByRole("button", { name: "Play Best" }).click();

  await expect(page).toHaveURL(/\/player$/);
  await expect(page.getByTestId("player-screen")).toBeVisible();
  await expect(page.locator("video")).toBeVisible();

  expect(controls.plannerRequests).toHaveLength(1);
  expect(
    playbackPlanRequestSchema.parse(controls.plannerRequests[0]),
  ).toMatchObject({
    type: "movie",
    id: FIXTURE_MOVIE_ID,
    action: "play",
    deviceProfile: { platform: "web" },
  });
});

test("a no-peers torrent automatically falls back to a direct candidate", async ({
  page,
}) => {
  const controls = await loginAndOpenFixture(page, "torrent-fallback");
  await page.getByRole("button", { name: "Play Best" }).click();

  await expect(page).toHaveURL(/\/player$/);
  await expect(page.getByTestId("player-screen")).toBeVisible();
  expect(controls.gatewayJobsCreated()).toBe(1);
  expect(controls.plannerRequests[0]?.action).toBe("play");
});

test("no peers is recoverable through advanced source selection", async ({
  page,
}, testInfo) => {
  const controls = await loginAndOpenFixture(page, "no-peers");
  await page.getByRole("button", { name: "Play Best" }).click();

  await expect(page.getByText("No Peers Found")).toBeVisible();
  const chooseSource = page.getByRole("button", {
    name: "Choose another source",
  });
  await expect(chooseSource).toBeVisible();
  await expect(page.getByRole("button", { name: "Go Back" })).toBeVisible();
  await expect(page).toHaveURL(/\/player$/);
  expect(controls.gatewayJobsCreated()).toBe(1);

  await page.screenshot({
    path: testInfo.outputPath(`player-recovery-${testInfo.project.name}.png`),
    animations: "disabled",
  });
  await chooseSource.click();
  await expect(page).toHaveURL(
    new RegExp(`/detail/movie/${FIXTURE_MOVIE_ID}\\?sources=1$`),
  );
  await expect(
    page.getByRole("button", { name: "Hide more sources" }),
  ).toBeVisible();
});

test("development player preview exposes the real control chrome", async ({
  page,
}, testInfo) => {
  await loginAndOpenFixture(page, "no-peers");
  await page.getByRole("button", { name: "Play Best" }).click();

  await page.getByRole("button", { name: "Preview player" }).click();
  await expect(page.getByTestId("player-screen")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play playback" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Audio, subtitles, and source" }),
  ).toBeVisible();
  await expect(page.getByText(/empty string/i)).toHaveCount(0);

  await page.screenshot({
    path: testInfo.outputPath(`player-preview-${testInfo.project.name}.png`),
    animations: "disabled",
  });
});

test("bridge unavailable produces a recoverable detail state", async ({
  page,
}) => {
  await loginAndOpenFixture(page, "bridge-unavailable");
  await page.getByRole("button", { name: "Play Best" }).click();

  await expect(page.getByText("Desktop bridge required")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sources & Devices" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/\/player$/);
});

test("download eligibility uses a planner action", async ({ page }) => {
  const downloadControls = await loginAndOpenFixture(
    page,
    "download-unsupported",
  );
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByText("No compatible source")).toBeVisible();
  expect(downloadControls.plannerRequests.at(-1)?.action).toBe("download");
});

test("cast eligibility uses a planner action and lists displays", async ({
  page,
}) => {
  const castControls = await installGoldenPathRoutes(page, "cast-ready");
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("qa@example.test");
  await page.getByPlaceholder("Password").fill("fixture-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("home-screen")).toBeVisible();
  await page
    .getByRole("button", { name: "Featured: Golden Path Adventure" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/detail/movie/${FIXTURE_MOVIE_ID}$`),
  );
  await page.getByRole("button", { name: "Cast" }).click();
  await expect(page.getByText("Cast to a display")).toBeVisible();
  await expect(page.getByText("Source ready. Choose a display.")).toBeVisible();
  await expect(page.getByText("Fixture Living Room")).toBeVisible();
  expect(castControls.plannerRequests.at(-1)?.action).toBe("cast");
});

test("primary surfaces remain responsive and keyboard accessible", async ({
  page,
}, testInfo) => {
  await installGoldenPathRoutes(page, "direct");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("qa@example.test");
  await page.getByPlaceholder("Password").fill("fixture-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("home-screen")).toBeVisible();

  const hero = page.getByRole("button", {
    name: "Featured: Golden Path Adventure",
  });
  await hero.focus();
  await expect(hero).toBeFocused();
  expect(await page.locator("button button").count()).toBe(0);
  expect(
    await hero.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).outlineWidth || "0"),
    ),
  ).toBeGreaterThanOrEqual(3);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
  await page.screenshot({
    path: testInfo.outputPath(`home-${testInfo.project.name}.png`),
    fullPage: true,
    animations: "disabled",
  });

  if (testInfo.project.name === "desktop-renderer") {
    await page.getByRole("link", { name: "Downloads" }).click();
  } else {
    await page.getByRole("tab", { name: "Downloads" }).click();
  }
  await expect(page).toHaveURL(/\/downloads$/);
  const emptyAction = page.getByRole("button", {
    name: "Browse movies and shows",
  });
  const smartDownloads = page.getByText("Smart Downloads", { exact: true });
  await expect(emptyAction).toBeVisible();
  await expect(smartDownloads).toBeVisible();
  const actionBox = await emptyAction.boundingBox();
  const panelTitleBox = await smartDownloads.boundingBox();
  expect(actionBox).not.toBeNull();
  expect(panelTitleBox).not.toBeNull();
  expect(panelTitleBox!.y).toBeGreaterThanOrEqual(
    actionBox!.y + actionBox!.height,
  );
  await page.screenshot({
    path: testInfo.outputPath(`downloads-${testInfo.project.name}.png`),
    fullPage: true,
    animations: "disabled",
  });
});

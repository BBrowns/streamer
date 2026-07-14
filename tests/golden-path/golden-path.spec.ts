import { expect, test, type Page } from "@playwright/test";
import { playbackPlanRequestSchema } from "@streamer/shared";
import {
  FIXTURE_MOVIE_ID,
  installGoldenPathRoutes,
  type GoldenPathScenario,
} from "./fixtures";

async function loginToFixtureShell(
  page: Page,
  scenario: GoldenPathScenario = "direct",
) {
  const controls = await installGoldenPathRoutes(page, scenario);
  await page.addInitScript(() => {
    window.localStorage.setItem("HAS_SEEN_ONBOARDING", "true");
  });
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("qa@example.test");
  await page.getByPlaceholder("Password").fill("fixture-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("home-screen")).toBeVisible();
  return controls;
}

async function loginAndOpenFixture(page: Page, scenario: GoldenPathScenario) {
  const controls = await loginToFixtureShell(page, scenario);
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

async function settleVisualTheme(
  page: Page,
  scheme: "dark" | "light",
  screenTestId: "settings-screen" | "search-screen",
) {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  const expectedBackground =
    scheme === "dark" ? "rgb(8,9,12)" : "rgb(243,242,239)";

  await expect
    .poll(() =>
      page
        .getByTestId(screenTestId)
        .evaluate((element) =>
          getComputedStyle(element).backgroundColor.replace(/\s/g, ""),
        ),
    )
    .toBe(expectedBackground);
  await settleVisualFrame(page);
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

  await expect(page.getByText("Finish playback setup")).toBeVisible();
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
  await expect(page.getByText("No compatible viewing option")).toBeVisible();
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
  const castDialog = page.getByRole("dialog");
  await expect(castDialog.getByText("Cast", { exact: true })).toBeVisible();
  await expect(castDialog.getByText("Golden Path Adventure")).toBeVisible();
  await expect(
    castDialog.getByText("Source ready. Choose a display."),
  ).toBeVisible();
  await expect(castDialog.getByText("Fixture Living Room")).toBeVisible();
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

test("Obsidian Settings uses a calm overview and focused detail panes", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await loginToFixtureShell(page);
  await page.goto("/settings");

  await expect(page.getByTestId("settings-screen")).toBeVisible();
  await settleVisualTheme(page, "dark", "settings-screen");
  await expectNoHorizontalPageOverflow(page);
  if (testInfo.project.name === "phone-web") {
    await expect(page.getByTestId("settings-overview")).toBeVisible();
  }
  await page.screenshot({
    path: testInfo.outputPath(
      `settings-overview-dark-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByTestId("settings-screen")).toBeVisible();
  await settleVisualTheme(page, "light", "settings-screen");
  await page.screenshot({
    path: testInfo.outputPath(
      `settings-overview-light-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.reload();
  await settleVisualTheme(page, "dark", "settings-screen");

  await page.getByTestId("settings-category-playback").click();
  await expect(page).toHaveURL(/\/settings\/playback$/);
  await expect(page.getByTestId("settings-detail-playback")).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `settings-playback-dark-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByTestId("settings-detail-playback")).toBeVisible();
  await settleVisualTheme(page, "light", "settings-screen");
  await page.screenshot({
    path: testInfo.outputPath(
      `settings-playback-light-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });
});

test("Obsidian Search keeps discovery and results media-first", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await loginToFixtureShell(page);
  await page.goto("/search");

  await expect(page.getByTestId("search-screen")).toBeVisible();
  await settleVisualTheme(page, "dark", "search-screen");
  await expect(page.getByTestId("search-discovery")).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `search-discovery-dark-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });

  let searchField = page.getByTestId("search-field");
  await searchField.fill("Golden");
  await expect(page.getByTestId("search-suggestions")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `search-suggestions-dark-${testInfo.project.name}.png`,
    ),
    animations: "disabled",
  });

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByTestId("search-discovery")).toBeVisible();
  await settleVisualTheme(page, "light", "search-screen");
  await page.screenshot({
    path: testInfo.outputPath(
      `search-discovery-light-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });

  searchField = page.getByTestId("search-field");
  await searchField.fill("Golden");
  await expect(page.getByTestId("search-suggestions")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `search-suggestions-light-${testInfo.project.name}.png`,
    ),
    animations: "disabled",
  });

  await searchField.press("Enter");
  await expect(page.getByTestId("search-results-grid")).toBeVisible();
  const resultsBox = await page
    .getByTestId("search-results-grid")
    .boundingBox();
  expect(resultsBox).not.toBeNull();
  expect(resultsBox!.y).toBeLessThan(
    testInfo.project.name === "desktop-renderer" ? 360 : 460,
  );
  await expectNoHorizontalPageOverflow(page);

  const filterToggle = page.getByTestId("search-filter-toggle");
  if ((await filterToggle.count()) === 1) {
    await filterToggle.click();
  }
  const lightFilterPanel = page.getByTestId("search-filter-panel");
  await expect(lightFilterPanel).toBeVisible();
  await expect(
    lightFilterPanel.getByText("Filters", { exact: true }),
  ).toBeVisible();
  await settleVisualFrame(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `search-filters-light-${testInfo.project.name}.png`,
    ),
    animations: "disabled",
  });
  await page.reload();
  await expect(page.getByTestId("search-results-grid")).toBeVisible();
  await settleVisualTheme(page, "light", "search-screen");
  await settleVisualFrame(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `search-results-light-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByTestId("search-results-grid")).toBeVisible();
  await settleVisualTheme(page, "dark", "search-screen");
  await settleVisualFrame(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `search-results-dark-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });
  const darkFilterToggle = page.getByTestId("search-filter-toggle");
  if ((await darkFilterToggle.count()) === 1) {
    await darkFilterToggle.click();
  }
  const darkFilterPanel = page.getByTestId("search-filter-panel");
  await expect(darkFilterPanel).toBeVisible();
  await expect(
    darkFilterPanel.getByText("Filters", { exact: true }),
  ).toBeVisible();
  await settleVisualFrame(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `search-filters-dark-${testInfo.project.name}.png`,
    ),
    animations: "disabled",
  });
});

test("Settings and Search adapt without overflow at intermediate widths", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-renderer",
    "Intermediate resizes run once in the desktop browser project.",
  );
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await loginToFixtureShell(page);

  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/settings");
    await expect(page.getByTestId("settings-screen")).toBeVisible();
    await expect(page.getByTestId("settings-overview")).toBeVisible();
    await expect(page.getByTestId("settings-detail-account")).toHaveCount(0);
    await expectNoHorizontalPageOverflow(page);
    await page.goto("/settings/playback");
    await expect(page.getByTestId("settings-detail-playback")).toBeVisible();
    await expect(page.getByTestId("settings-overview")).toHaveCount(0);

    await page.goto("/search?q=Golden");
    await expect(page.getByTestId("search-screen")).toBeVisible();
    await expect(page.getByTestId("search-results-grid")).toBeVisible();
    await expect(page.getByTestId("search-filter-toggle")).toBeVisible();
    await expect(page.getByTestId("search-filter-panel")).toHaveCount(0);
    await expectNoHorizontalPageOverflow(page);
    await page.getByTestId("search-filter-toggle").click();
    await expect(page.getByTestId("search-filter-panel")).toBeVisible();
    await page.getByRole("button", { name: "Close filters" }).last().click();
  }
});

test("legacy Settings and Search URLs redirect to canonical routes", async ({
  page,
}) => {
  await loginToFixtureShell(page);

  await page.goto("/sources");
  await expect(page).toHaveURL(/\/settings\/sources$/);
  await expect(page.getByTestId("settings-detail-sources")).toBeVisible();

  await page.goto("/settings/not-a-section");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("settings-screen")).toBeVisible();

  await page.goto(
    "/search/results?q=Golden&type=movie&provider=fixture-addon&sort=relevance",
  );
  await expect(page).toHaveURL(/\/search\?/);
  const canonicalUrl = new URL(page.url());
  expect(canonicalUrl.searchParams.get("q")).toBe("Golden");
  expect(canonicalUrl.searchParams.get("type")).toBe("movie");
  expect(canonicalUrl.searchParams.get("provider")).toBe("fixture-addon");
  expect(canonicalUrl.searchParams.has("sort")).toBe(false);
});

test("Command Palette supports arrow navigation and Enter", async ({
  page,
}) => {
  await loginToFixtureShell(page);
  await page.keyboard.press("Meta+k");
  await expect(page.getByTestId("command-palette")).toBeVisible();

  const field = page.getByTestId("command-search-field");
  await field.fill("Golden");
  await expect(
    page.getByTestId(`search-result-movie-${FIXTURE_MOVIE_ID}`),
  ).toBeVisible();
  await field.press("ArrowDown");
  await field.press("ArrowUp");
  await field.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`/detail/movie/${FIXTURE_MOVIE_ID}$`),
  );
});

test("partial provider failures keep successful Search results visible", async ({
  page,
}) => {
  await loginToFixtureShell(page, "search-partial");
  await page.goto("/search?q=Golden");

  await expect(page.getByTestId("search-results-grid")).toBeVisible();
  await expect(
    page.getByText(/Some sources could not be reached/i),
  ).toBeVisible();
});

test("resetting Search filters clears provider and URL state", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-renderer",
    "The persistent large-screen filter sidebar makes URL assertions stable.",
  );
  await loginToFixtureShell(page);
  await page.goto(
    "/search?q=Golden&type=movie&year=2026&provider=fixture-addon&sort=year",
  );
  await expect(page.getByTestId("search-results-grid")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();

  await expect
    .poll(() => {
      const url = new URL(page.url());
      return ["type", "year", "provider", "sort"].filter((key) =>
        url.searchParams.has(key),
      );
    })
    .toEqual([]);
});

import { expect, test, type Locator, type Page } from "@playwright/test";
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
    .getByTestId("home-hero")
    .getByRole("button", { name: "View details" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/detail/movie/${FIXTURE_MOVIE_ID}$`),
  );
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();
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

async function expectPointerFocusWithoutKeyboardRing(locator: Locator) {
  await locator.click();
  const outline = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth || "0"),
    };
  });
  expect(outline.style === "none" || outline.width < 3).toBe(true);
}

async function focusWithKeyboard(
  page: Page,
  locator: Locator,
  maximumTabs = 24,
) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  for (let index = 0; index < maximumTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (
      await locator.evaluate(
        (element) => element === element.ownerDocument.activeElement,
      )
    ) {
      return;
    }
  }
  throw new Error(
    `Target did not receive keyboard focus after ${maximumTabs} Tabs.`,
  );
}

async function getElementBoxes(locator: Locator) {
  return locator.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom,
      };
    }),
  );
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

test("browse to detail and Play reaches a direct player", async ({ page }) => {
  const controls = await loginAndOpenFixture(page, "direct");
  await page.getByRole("button", { name: "Play" }).click();

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
  await page.getByRole("button", { name: "Play" }).click();

  await expect(page).toHaveURL(/\/player$/);
  await expect(page.getByTestId("player-screen")).toBeVisible();
  expect(controls.gatewayJobsCreated()).toBe(1);
  expect(controls.plannerRequests[0]?.action).toBe("play");
});

test("no peers is recoverable through advanced source selection", async ({
  page,
}, testInfo) => {
  const controls = await loginAndOpenFixture(page, "no-peers");
  await page.getByRole("button", { name: "Play" }).click();

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
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await loginAndOpenFixture(page, "no-peers");
  await page.getByRole("button", { name: "Play" }).click();

  await page.getByRole("button", { name: "Preview player" }).click();
  await expect(page.getByTestId("player-screen")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play playback" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Audio, subtitles, and source" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Audio, subtitles, and source" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Playback settings" }),
  ).toHaveCount(0);
  await expect(page.getByText(/empty string/i)).toHaveCount(0);

  const hitZones = [
    page.getByTestId("player-hit-zone-left"),
    page.getByTestId("player-hit-zone-center"),
    page.getByTestId("player-hit-zone-right"),
  ];
  for (const zone of hitZones) {
    await expect(zone).toHaveAttribute("tabindex", "-1");
    expect(
      await zone.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.outlineStyle === "none" || style.outlineWidth === "0px";
      }),
    ).toBe(true);
  }

  if (testInfo.project.name === "phone-web") {
    const statusRow = page.getByTestId("player-controls-status-row");
    const actionRow = page.getByTestId("player-controls-action-row");
    const [statusBox, actionBox] = await Promise.all([
      statusRow.boundingBox(),
      actionRow.boundingBox(),
    ]);
    expect(statusBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(actionBox!.y).toBeGreaterThanOrEqual(
      statusBox!.y + statusBox!.height - 1,
    );
  }

  if (testInfo.project.name === "desktop-renderer") {
    const play = page.getByRole("button", { name: "Play playback" });
    const close = page.getByRole("button", { name: "Close" });
    const seekBack = page.getByRole("button", {
      name: "Seek back unavailable",
    });
    const settings = page.getByRole("button", {
      name: "Audio, subtitles, and source",
    });
    const progress = page.getByRole("slider", {
      name: "Playback progress unavailable",
    });
    const [playBox, closeBox, seekBackBox, settingsBox, progressBox] =
      await Promise.all([
        play.boundingBox(),
        close.boundingBox(),
        seekBack.boundingBox(),
        settings.boundingBox(),
        progress.boundingBox(),
      ]);
    for (const box of [
      playBox,
      closeBox,
      seekBackBox,
      settingsBox,
      progressBox,
    ]) {
      expect(box).not.toBeNull();
    }
    expect(playBox!.width).toBeLessThanOrEqual(68);
    expect(playBox!.height).toBeLessThanOrEqual(68);
    expect(closeBox!.width).toBeLessThanOrEqual(48);
    expect(closeBox!.height).toBeLessThanOrEqual(48);
    expect(seekBackBox!.width).toBeLessThanOrEqual(52);
    expect(seekBackBox!.height).toBeLessThanOrEqual(52);
    expect(progressBox!.y).toBeGreaterThan(800);
    expect(settingsBox!.y + settingsBox!.height).toBeGreaterThan(900);
    expect(settingsBox!.y + settingsBox!.height).toBeLessThanOrEqual(992);
  }

  await page.screenshot({
    path: testInfo.outputPath(`player-preview-${testInfo.project.name}.png`),
    animations: "disabled",
  });
});

test("player volume owns its browser keyboard controls", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-renderer",
    "Player keyboard ownership is a desktop browser contract.",
  );
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await loginAndOpenFixture(page, "direct");
  await page.getByRole("button", { name: "Play" }).click();

  await expect(page).toHaveURL(/\/player$/);
  await expect(page.getByTestId("player-screen")).toBeVisible();
  const play = page.getByRole("button", { name: "Play playback" });
  const volume = page.getByRole("slider", { name: "Volume" });
  await expect(play).toBeVisible();
  await expect(volume).toBeVisible();

  await focusWithKeyboard(page, volume);
  const focusOutline = await volume.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth || "0"),
    };
  });
  expect(focusOutline.style).toBe("solid");
  expect(focusOutline.width).toBeGreaterThanOrEqual(3);

  await page.keyboard.press("Home");
  await expect(volume).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("ArrowRight");
  await expect(volume).toHaveAttribute("aria-valuenow", "10");
  await page.keyboard.press("ArrowUp");
  await expect(volume).toHaveAttribute("aria-valuenow", "20");
  await page.keyboard.press("ArrowLeft");
  await expect(volume).toHaveAttribute("aria-valuenow", "10");
  await page.keyboard.press("ArrowDown");
  await expect(volume).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("End");
  await expect(volume).toHaveAttribute("aria-valuenow", "100");

  // Space belongs to the focused adjustable control and must not bubble into
  // the global play/pause shortcut.
  await page.keyboard.press("Space");
  await expect(play).toBeVisible();
});

test("Escape cancels source preparation through the active session", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-renderer",
    "Escape cancellation is a desktop keyboard contract.",
  );
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const controls = await loginAndOpenFixture(page, "preparing-cancellable");
  await page.getByRole("button", { name: "Play" }).click();

  await expect(page).toHaveURL(/\/player$/);
  await expect.poll(controls.gatewayJobsCreated).toBeGreaterThan(0);
  const cancel = page.getByRole("button", {
    name: "Cancel source preparation",
  });
  await expect(cancel).toBeVisible();
  expect(controls.gatewayJobsCancelled()).toBe(0);
  const cancelBox = await cancel.boundingBox();
  expect(cancelBox).not.toBeNull();
  expect(cancelBox!.y).toBeLessThanOrEqual(32);
  expect(cancelBox!.x + cancelBox!.width).toBeGreaterThanOrEqual(1380);

  await page.screenshot({
    path: testInfo.outputPath(
      `player-preparation-cancellable-${testInfo.project.name}.png`,
    ),
    animations: "disabled",
  });

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(
    new RegExp(`/detail/movie/${FIXTURE_MOVIE_ID}$`),
  );
  await expect.poll(controls.gatewayJobsCancelled).toBeGreaterThan(0);
});

test("bridge unavailable produces a recoverable detail state", async ({
  page,
}) => {
  await loginAndOpenFixture(page, "bridge-unavailable");
  await page.getByRole("button", { name: "Play" }).click();

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
    .getByTestId("home-hero")
    .getByRole("button", { name: "View details" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/detail/movie/${FIXTURE_MOVIE_ID}$`),
  );
  await page.getByRole("button", { name: "Cast to device" }).click();
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

  const hero = page.getByTestId("home-hero");
  const heroPrimaryAction = hero.getByTestId("home-hero-primary-action");
  await focusWithKeyboard(page, heroPrimaryAction);
  await expect(heroPrimaryAction).toBeFocused();
  expect(await page.locator("button button").count()).toBe(0);
  expect(
    await heroPrimaryAction.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        style.outlineStyle !== "none" &&
        Number.parseFloat(style.outlineWidth || "0") >= 3
      );
    }),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
  await page.screenshot({
    path: testInfo.outputPath(`home-${testInfo.project.name}.png`),
    fullPage: true,
    animations: "disabled",
  });

  if (testInfo.project.name === "phone-web") {
    await page.getByRole("tab", { name: "Downloads" }).click();
  } else {
    await page.getByRole("link", { name: "Downloads" }).click();
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

test("pointer focus stays quiet while keyboard focus remains explicit", async ({
  page,
}, testInfo) => {
  await loginToFixtureShell(page);
  const searchNavigation = page.getByRole(
    testInfo.project.name === "phone-web" ? "tab" : "link",
    { name: "Search" },
  );

  if (testInfo.project.name === "phone-web") {
    // The mobile-web project has touch enabled, so a tap is not treated as a
    // pointer-focus assertion. Pointer modality is covered by the other three
    // window projects.
    await searchNavigation.tap();
  } else {
    await expectPointerFocusWithoutKeyboardRing(searchNavigation);
  }
  await expect(page).toHaveURL(/\/search$/);

  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  await expect
    .poll(() =>
      focused.evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          style.outlineStyle !== "none" &&
          Number.parseFloat(style.outlineWidth || "0") >= 3
        );
      }),
    )
    .toBe(true);
});

test("Library grid uses bounded fixed cards at every window class", async ({
  page,
}, testInfo) => {
  await loginToFixtureShell(page);
  await page.goto("/library");

  const cards = page.locator('[data-testid^="library-card-library:"]');
  await expect(cards).toHaveCount(9);
  await settleVisualFrame(page);

  const boxes = await getElementBoxes(cards);
  const firstRow = boxes
    .filter((box) => Math.abs(box.y - boxes[0].y) <= 2)
    .sort((left, right) => left.x - right.x);
  const expectedColumns: Record<string, { minimum: number; maximum: number }> =
    {
      "phone-web": { minimum: 2, maximum: 2 },
      "tablet-portrait-web": { minimum: 3, maximum: 3 },
      "tablet-landscape-web": { minimum: 4, maximum: 5 },
      "desktop-renderer": { minimum: 5, maximum: 7 },
    };
  const expected = expectedColumns[testInfo.project.name];

  expect(firstRow.length).toBeGreaterThanOrEqual(expected.minimum);
  expect(firstRow.length).toBeLessThanOrEqual(expected.maximum);
  for (const box of firstRow) {
    expect(Math.abs(box.width - firstRow[0].width)).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThanOrEqual(112);
    expect(box.width).toBeLessThanOrEqual(220);
  }
  for (let index = 1; index < firstRow.length; index += 1) {
    const gap = firstRow[index].x - firstRow[index - 1].right;
    expect(gap).toBeGreaterThanOrEqual(15);
    expect(gap).toBeLessThanOrEqual(17);
  }
  if (testInfo.project.name === "desktop-renderer") {
    expect(firstRow[0].width).toBeGreaterThanOrEqual(180);
  }
  await expectNoHorizontalPageOverflow(page);
});

test("desktop media rails bound navigation and reveal the final caption", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-renderer",
    "Pointer arrows are a large-screen contract; compact layouts use touch swipe.",
  );
  await loginToFixtureShell(page);

  const rail = page.getByTestId("catalog-rail-fixture-addon-movie-featured");
  await expect(rail).toBeVisible();
  const back = rail.getByRole("button", { name: "Scroll left" });
  const forward = rail.getByRole("button", { name: "Scroll right" });
  await expect(back).toBeDisabled();
  await expect(forward).toBeEnabled();

  for (
    let attempt = 0;
    attempt < 10 && (await forward.isEnabled());
    attempt += 1
  ) {
    await forward.click();
    await page.waitForTimeout(250);
  }
  await expect(forward).toBeDisabled();
  await expect(back).toBeEnabled();

  const lastCard = rail.locator("[data-catalog-card]").last();
  const [railBox, lastCardBox] = await Promise.all([
    rail.boundingBox(),
    lastCard.boundingBox(),
  ]);
  expect(railBox).not.toBeNull();
  expect(lastCardBox).not.toBeNull();
  expect(lastCardBox!.x).toBeGreaterThanOrEqual(railBox!.x - 1);
  expect(lastCardBox!.x + lastCardBox!.width).toBeLessThanOrEqual(
    railBox!.x + railBox!.width + 1,
  );
  expect(lastCardBox!.y + lastCardBox!.height).toBeLessThanOrEqual(
    railBox!.y + railBox!.height + 1,
  );
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

test("Sources and Advanced expose mutually exclusive responsibilities", async ({
  page,
}) => {
  await loginToFixtureShell(page);

  await page.goto("/settings/sources");
  const sources = page.getByTestId("sources-consumer-section");
  await expect(sources).toBeVisible();
  await expect(sources.getByText("Content Add-ons")).toBeVisible();
  await expect(sources.getByText("Local Playback Service")).toBeVisible();
  await expect(sources.getByText("Casting & Devices")).toBeVisible();
  await expect(page.getByTestId("sources-advanced-section")).toHaveCount(0);
  await expectNoHorizontalPageOverflow(page);

  await page.goto("/settings/advanced");
  const advanced = page.getByTestId("sources-advanced-section");
  await expect(advanced).toBeVisible();
  await expect(
    advanced.getByText("Connection settings", { exact: true }),
  ).toBeVisible();
  await expect(
    advanced.getByText("Playback service maintenance", { exact: true }),
  ).toBeVisible();
  await expect(
    advanced.getByText("Ready to play", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("sources-consumer-section")).toHaveCount(0);
  await expectNoHorizontalPageOverflow(page);
});

test("Search keeps active retrieval focused and results media-first", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await loginToFixtureShell(page);
  await page.goto("/search");

  await expect(page.getByTestId("search-screen")).toBeVisible();
  await settleVisualTheme(page, "dark", "search-screen");
  await expect(page.getByTestId("recent-searches-page")).toBeVisible();
  await expect(page.getByTestId("search-results-type-tabs")).toHaveCount(0);
  await expect(page.getByTestId("search-discovery")).toHaveCount(0);
  const searchShell = page.getByTestId("search-field-container");
  await expect(searchShell).toBeVisible();
  const searchShellBox = await searchShell.boundingBox();
  expect(searchShellBox).not.toBeNull();
  expect(searchShellBox!.height).toBeGreaterThanOrEqual(56);
  expect(searchShellBox!.height).toBeLessThanOrEqual(64);
  expect(searchShellBox!.width).toBeLessThanOrEqual(762);

  const titleBox = await page
    .getByText("Find a movie or series", { exact: true })
    .boundingBox();
  expect(titleBox).not.toBeNull();
  expect(Math.abs(searchShellBox!.x - titleBox!.x)).toBeLessThanOrEqual(2);
  expect(searchShellBox!.y).toBeGreaterThanOrEqual(
    titleBox!.y + titleBox!.height,
  );
  await expectNoHorizontalPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(`search-empty-dark-${testInfo.project.name}.png`),
    fullPage: true,
    animations: "disabled",
  });

  let searchField = page.getByTestId("search-field");
  await searchField.fill("Golden");
  await expect(page.getByTestId("search-suggestions")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show all results for “Golden”" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `search-suggestions-dark-${testInfo.project.name}.png`,
    ),
    animations: "disabled",
  });

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByTestId("recent-searches-page")).toBeVisible();
  await settleVisualTheme(page, "light", "search-screen");
  await page.screenshot({
    path: testInfo.outputPath(
      `search-empty-light-${testInfo.project.name}.png`,
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
  const typeTabs = page.getByTestId("search-results-type-tabs");
  await expect(typeTabs).toBeVisible();
  await expect(typeTabs.getByRole("tab")).toHaveCount(3);
  await expect(typeTabs.getByRole("tab", { name: "All" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const typeTabsBox = await typeTabs.boundingBox();
  expect(typeTabsBox).not.toBeNull();
  expect(typeTabsBox!.height).toBeGreaterThanOrEqual(44);
  expect(typeTabsBox!.height).toBeLessThanOrEqual(54);
  expect(typeTabsBox!.width).toBeLessThanOrEqual(290);

  const movieTab = typeTabs.getByRole("tab", { name: "Movies" });
  await movieTab.click();
  await expect(movieTab).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("type"))
    .toBe("movie");
  const allTab = typeTabs.getByRole("tab", { name: "All" });
  await allTab.click();
  await expect(allTab).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("type"))
    .toBeNull();
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

  await page.goto("/search");
  await expect(page.getByTestId("recent-searches-page")).toBeVisible();
  await expect(page.getByText("Golden", { exact: true })).toBeVisible();
  await settleVisualTheme(page, "dark", "search-screen");
  await page.screenshot({
    path: testInfo.outputPath(
      `search-recent-dark-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByTestId("recent-searches-page")).toBeVisible();
  await settleVisualTheme(page, "light", "search-screen");
  await page.screenshot({
    path: testInfo.outputPath(
      `search-recent-light-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });
});

test("Search distinguishes a completed search with no results", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await loginToFixtureShell(page, "search-empty");
  await page.goto("/search?q=Impossible%20Fixture");
  await expect(
    page.getByText("No titles found", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `search-no-results-dark-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.reload();
  await expect(
    page.getByText("No titles found", { exact: true }),
  ).toBeVisible();
  await settleVisualTheme(page, "light", "search-screen");
  await page.screenshot({
    path: testInfo.outputPath(
      `search-no-results-light-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });
});

test("Search explains when no searchable provider is installed", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await loginToFixtureShell(page, "search-no-provider");
  await page.goto("/search?q=The%20Matrix");
  await expect(
    page.getByText("A searchable catalog is required", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage add-ons" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `search-no-provider-dark-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.reload();
  await expect(
    page.getByText("A searchable catalog is required", { exact: true }),
  ).toBeVisible();
  await settleVisualTheme(page, "light", "search-screen");
  await page.screenshot({
    path: testInfo.outputPath(
      `search-no-provider-light-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });
});

test("Search distinguishes unavailable providers from missing capability", async ({
  page,
}) => {
  await loginToFixtureShell(page, "search-unavailable");
  await page.goto("/search?q=The%20Matrix");
  await expect(
    page.getByText("Sources are temporarily unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(
    page.getByText("A searchable catalog is required", { exact: true }),
  ).toHaveCount(0);
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

test("Command Palette distinguishes submit from deliberate title navigation", async ({
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
  await field.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Golden/);

  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("command-palette")).toBeVisible();
  const controlField = page.getByTestId("command-search-field");
  await controlField.fill("Golden");
  await expect(
    page.getByTestId(`search-result-movie-${FIXTURE_MOVIE_ID}`),
  ).toBeVisible();
  await controlField.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Golden/);
  await expect(page.getByTestId("command-palette")).toHaveCount(0);

  await page.keyboard.press("Meta+k");
  await expect(page.getByTestId("command-palette")).toBeVisible();
  const reopenedField = page.getByTestId("command-search-field");
  await reopenedField.fill("Golden");
  const firstPaletteSuggestion = page.getByTestId(
    `search-suggestion-movie-${FIXTURE_MOVIE_ID}`,
  );
  // The submitted Search page underneath the modal contains the same result
  // card. Wait for the palette's debounced suggestion before navigating it.
  await expect(firstPaletteSuggestion).toBeVisible();
  await reopenedField.press("ArrowDown");
  await expect(page.getByTestId("search-suggestion-announcement")).toHaveText(
    "Golden Path Adventure",
  );
  await reopenedField.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`/detail/movie/${FIXTURE_MOVIE_ID}$`),
  );
});

test("Command Palette keeps the all-results row keyboard reachable", async ({
  page,
}) => {
  await loginToFixtureShell(page);
  await page.keyboard.press("Meta+k");
  const field = page.getByTestId("command-search-field");
  await field.fill("Golden");
  await expect(page.getByTestId("command-search-suggestions")).toBeVisible();
  await expect(
    page.getByTestId(`search-suggestion-movie-${FIXTURE_MOVIE_ID}`),
  ).toBeVisible();
  await field.press("ArrowDown");
  await field.press("ArrowUp");
  await expect(
    page.getByTestId("search-suggestion-announcement"),
  ).toContainText("Show all results");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Golden/);
});

test("Search clear, resubmit, back, and forward restore route state", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-renderer",
    "Browser-history state is exercised once in the desktop renderer.",
  );
  await loginToFixtureShell(page);
  await page.goto("/search");

  let field = page.getByTestId("search-field");
  await field.fill("Golden");
  await field.press("Enter");
  await expect(page.getByTestId("search-results-grid")).toBeVisible();

  const typeTabs = page.getByTestId("search-results-type-tabs");
  await typeTabs.getByRole("tab", { name: "Movies" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("type"))
    .toBe("movie");

  await page.goBack();
  await expect(page.getByTestId("search-results-grid")).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("Golden");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("type"))
    .toBeNull();
  await expect(
    page.getByTestId("search-results-type-tabs").getByRole("tab", {
      name: "All",
    }),
  ).toHaveAttribute("aria-selected", "true");

  await page.goBack();
  await expect(page.getByTestId("recent-searches-page")).toBeVisible();
  await expect(page.getByTestId("search-results-type-tabs")).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/search");
  await expect.poll(() => new URL(page.url()).search).toBe("");

  await page.goForward();
  await expect(page.getByTestId("search-results-grid")).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("Golden");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("type"))
    .toBeNull();

  await page.goForward();
  await expect(page.getByTestId("search-results-grid")).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("type"))
    .toBe("movie");
  await expect(
    page.getByTestId("search-results-type-tabs").getByRole("tab", {
      name: "Movies",
    }),
  ).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByTestId("recent-searches-page")).toBeVisible();
  await expect.poll(() => new URL(page.url()).search).toBe("");

  field = page.getByTestId("search-field");
  await field.fill("Golden");
  await field.press("Enter");
  await expect(page.getByTestId("search-results-grid")).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("Golden");
});

test("partial provider failures keep successful Search results visible", async ({
  page,
}, testInfo) => {
  await loginToFixtureShell(page, "search-partial");
  await page.goto("/search?q=Golden");

  await expect(page.getByTestId("search-results-grid")).toBeVisible();
  await expect(
    page.getByText(/Some sources could not be reached/i),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `search-partial-dark-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByTestId("search-results-grid")).toBeVisible();
  await expect(
    page.getByText(/Some sources could not be reached/i),
  ).toBeVisible();
  await settleVisualTheme(page, "light", "search-screen");
  await page.screenshot({
    path: testInfo.outputPath(
      `search-partial-light-${testInfo.project.name}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });
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

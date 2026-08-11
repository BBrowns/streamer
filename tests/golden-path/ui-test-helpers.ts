import { expect, type Page } from "@playwright/test";
import { installGoldenPathRoutes, type GoldenPathScenario } from "./fixtures";

export type VisualColorScheme = "dark" | "light";

export const deterministicScreenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const,
  fullPage: true,
  scale: "css" as const,
};

export type FixtureShellOptions = {
  scenario?: GoldenPathScenario;
  colorScheme?: VisualColorScheme;
  settle?: boolean;
};

/**
 * Wait for the frame inputs that can change a screenshot to settle. Keeping
 * this in one place prevents golden-path and visual suites from drifting.
 */
export async function settleVisualFrame(page: Page) {
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

export async function loginToFixtureShell(
  page: Page,
  options: FixtureShellOptions = {},
) {
  const controls = await installGoldenPathRoutes(
    page,
    options.scenario ?? "direct",
  );
  await page.emulateMedia({
    ...(options.colorScheme ? { colorScheme: options.colorScheme } : {}),
    reducedMotion: "reduce",
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("HAS_SEEN_ONBOARDING", "true");
  });
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("qa@example.test");
  await page.getByPlaceholder("Password").fill("fixture-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("home-screen")).toBeVisible();
  if (options.settle ?? true) {
    await settleVisualFrame(page);
  }
  return controls;
}

export async function expectNoHorizontalPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

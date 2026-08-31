describe("App Launch Smoke Test", () => {
  beforeAll(async () => {
    // Start from a clean app state so a route persisted by a previous Detox
    // run cannot leave the onboarding stack over the tab navigator.
    await device.launchApp({ newInstance: true, delete: true });
  });

  beforeEach(async () => {
    await device.launchApp({ newInstance: true, delete: true });
  });

  it("should show the home screen after launch", async () => {
    await waitFor(element(by.id("home-screen")))
      .toBeVisible()
      .withTimeout(30000);
  });

  it("should navigate to the canonical search tab", async () => {
    await waitFor(element(by.id("tab-search")))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id("tab-search")).tap();
    await expect(element(by.id("search-screen"))).toBeVisible();
  });
});

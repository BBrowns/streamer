describe("App Launch Smoke Test", () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("should show the home screen after launch", async () => {
    await expect(element(by.id("home-grid"))).toBeVisible();
  });

  it("should navigate to the canonical search tab", async () => {
    await element(by.label("Search")).tap();
    await expect(element(by.id("search-screen"))).toBeVisible();
  });
});

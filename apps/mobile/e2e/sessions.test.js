describe("Session Management", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("should open settings and launch the active sessions modal", async () => {
    // Navigate to Settings tab
    await element(by.label("Settings")).tap();

    // Tap the 'Active Sessions' menu item
    await waitFor(element(by.id("btn-settings-sessions")))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id("btn-settings-sessions")).tap();

    // The modal should appear (we check for the "Done" button or the title)
    await expect(element(by.text("Active Sessions"))).toBeVisible();
  });

  it("should allow dismissing the sessions modal", async () => {
    await element(by.label("Settings")).tap();
    await element(by.id("btn-settings-sessions")).tap();

    // Tap Done to close modal
    await element(by.text("Done")).tap();
    await expect(element(by.text("Active Sessions"))).not.toBeVisible();
  });
});

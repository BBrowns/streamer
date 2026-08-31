describe("Session Management", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true, delete: true });
  });

  beforeEach(async () => {
    await device.launchApp({ newInstance: true, delete: true });
  });

  it("should open settings and launch the active sessions modal", async () => {
    // Settings is intentionally hidden from the compact tab bar; open it from
    // the profile menu like a real mobile user.
    await waitFor(element(by.id("mobile-profile-menu-trigger")))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id("mobile-profile-menu-trigger")).tap();
    await waitFor(element(by.id("mobile-settings-menu-item")))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id("mobile-settings-menu-item")).tap();
    await waitFor(element(by.id("settings-category-account")))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id("settings-category-account")).tap();

    // Tap the 'Active Sessions' menu item
    await waitFor(element(by.id("btn-settings-sessions")))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id("btn-settings-sessions")).tap();

    // The modal should appear. Its title is localized, so assert the stable
    // overlay identifier rather than a translated string.
    await expect(element(by.id("active-sessions-overlay"))).toBeVisible();
  });

  it("should allow dismissing the sessions modal", async () => {
    await waitFor(element(by.id("mobile-profile-menu-trigger")))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id("mobile-profile-menu-trigger")).tap();
    await waitFor(element(by.id("mobile-settings-menu-item")))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id("mobile-settings-menu-item")).tap();
    await waitFor(element(by.id("settings-category-account")))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id("settings-category-account")).tap();
    await waitFor(element(by.id("btn-settings-sessions")))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id("btn-settings-sessions")).tap();

    // Tap Done to close modal
    await waitFor(element(by.id("active-sessions-overlay")))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id("active-sessions-close")).tap();
    await expect(element(by.id("active-sessions-overlay"))).not.toBeVisible();
  });
});

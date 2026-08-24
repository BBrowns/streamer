import {
  getPlayerChromeAutoHideDelay,
  shouldAutoHidePlayerChrome,
} from "../playerChromePolicy";

describe("playerChromePolicy", () => {
  it("uses a shorter desktop delay than the compact touch presentation", () => {
    expect(getPlayerChromeAutoHideDelay(false)).toBe(2500);
    expect(getPlayerChromeAutoHideDelay(true)).toBe(3000);
  });

  it("only auto-hides during uninterrupted active playback", () => {
    expect(
      shouldAutoHidePlayerChrome({
        isPlaying: true,
        isScrubbing: false,
        settingsOpen: false,
        hasControlFocus: false,
        screenReaderEnabled: false,
      }),
    ).toBe(true);

    for (const heldState of [
      { isPlaying: false },
      { isScrubbing: true },
      { settingsOpen: true },
      { hasControlFocus: true },
      { screenReaderEnabled: true },
    ]) {
      expect(
        shouldAutoHidePlayerChrome({
          isPlaying: true,
          isScrubbing: false,
          settingsOpen: false,
          hasControlFocus: false,
          screenReaderEnabled: false,
          ...heldState,
        }),
      ).toBe(false);
    }
  });
});

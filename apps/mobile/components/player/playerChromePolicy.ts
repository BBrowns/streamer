export interface PlayerChromePolicyInput {
  isPlaying: boolean;
  isScrubbing: boolean;
  settingsOpen: boolean;
  hasControlFocus: boolean;
  screenReaderEnabled: boolean;
}

export function shouldAutoHidePlayerChrome({
  isPlaying,
  isScrubbing,
  settingsOpen,
  hasControlFocus,
  screenReaderEnabled,
}: PlayerChromePolicyInput) {
  return (
    isPlaying &&
    !isScrubbing &&
    !settingsOpen &&
    !hasControlFocus &&
    !screenReaderEnabled
  );
}

export function getPlayerChromeAutoHideDelay(isCompact: boolean) {
  return isCompact ? 3000 : 2500;
}

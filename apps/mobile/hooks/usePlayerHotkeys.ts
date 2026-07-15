import { useEffect } from "react";
import { Platform } from "react-native";
import type { VideoPlayer } from "expo-video";

interface UsePlayerHotkeysArgs {
  player: VideoPlayer | null;
  showControls: () => void;
  setSeekFeedback: (side: "left" | "right" | null) => void;
  seekFeedbackTimer: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  SEEK_SECONDS: number;
  canSeek?: boolean;
  onToggleFullscreen?: () => void;
  onToggleMute?: () => void;
  onSeekBy?: (seconds: number) => void;
  onSeekPercent?: (percent: number) => void;
  onEscape?: () => boolean | void;
}

export type PlayerEscapeAction =
  | "closeSettings"
  | "closeCast"
  | "cancelPreparation";

export function getPlayerEscapeAction({
  settingsOpen,
  castOpen,
  preparationActive,
}: {
  settingsOpen: boolean;
  castOpen: boolean;
  preparationActive: boolean;
}): PlayerEscapeAction | null {
  if (settingsOpen) return "closeSettings";
  if (castOpen) return "closeCast";
  if (preparationActive) return "cancelPreparation";
  return null;
}

const INTERACTIVE_PLAYER_CONTROL_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="listbox"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
].join(",");

export function isPlayerHotkeyTargetInteractive(
  target: EventTarget | null,
): boolean {
  if (!target || typeof (target as Element).closest !== "function") {
    return false;
  }

  return Boolean(
    (target as Element).closest(INTERACTIVE_PLAYER_CONTROL_SELECTOR),
  );
}

export function usePlayerHotkeys({
  player,
  showControls,
  setSeekFeedback,
  seekFeedbackTimer,
  SEEK_SECONDS,
  canSeek = true,
  onToggleFullscreen,
  onToggleMute,
  onSeekBy,
  onSeekPercent,
  onEscape,
}: UsePlayerHotkeysArgs) {
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Escape remains a player-level dismissal contract, including while a
      // nested control has focus. All other shortcuts yield to the focused
      // interactive control so Space and arrow keys retain their native
      // button/slider meaning.
      if (key === "escape") {
        if (onEscape && onEscape() !== false) e.preventDefault();
        return;
      }

      const focusedTarget =
        typeof document !== "undefined" ? document.activeElement : null;
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isPlayerHotkeyTargetInteractive(e.target) ||
        isPlayerHotkeyTargetInteractive(focusedTarget)
      ) {
        return;
      }

      switch (key) {
        case " ":
        case "k":
          e.preventDefault();
          if (player?.playing) {
            player.pause();
          } else {
            player?.play();
          }
          showControls();
          break;
        case "f":
          e.preventDefault();
          if (onToggleFullscreen) onToggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          if (onToggleMute) onToggleMute();
          else if (player) player.muted = !player.muted;
          showControls();
          break;
        case "arrowleft":
        case "j":
          e.preventDefault();
          if (!canSeek) break;
          if (onSeekBy) onSeekBy(-SEEK_SECONDS);
          else player?.seekBy(-SEEK_SECONDS);
          setSeekFeedback("left");
          if (seekFeedbackTimer.current)
            clearTimeout(seekFeedbackTimer.current);
          seekFeedbackTimer.current = setTimeout(
            () => setSeekFeedback(null),
            600,
          );
          showControls();
          break;
        case "arrowright":
        case "l":
          e.preventDefault();
          if (!canSeek) break;
          if (onSeekBy) onSeekBy(SEEK_SECONDS);
          else player?.seekBy(SEEK_SECONDS);
          setSeekFeedback("right");
          if (seekFeedbackTimer.current)
            clearTimeout(seekFeedbackTimer.current);
          seekFeedbackTimer.current = setTimeout(
            () => setSeekFeedback(null),
            600,
          );
          showControls();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          e.preventDefault();
          if (canSeek && player && player.duration) {
            const percent = parseInt(e.key) * 10;
            if (onSeekPercent) onSeekPercent(percent);
            else player.currentTime = (player.duration * percent) / 100;
            showControls();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    player,
    showControls,
    setSeekFeedback,
    seekFeedbackTimer,
    SEEK_SECONDS,
    canSeek,
    onToggleFullscreen,
    onToggleMute,
    onSeekBy,
    onSeekPercent,
    onEscape,
  ]);
}

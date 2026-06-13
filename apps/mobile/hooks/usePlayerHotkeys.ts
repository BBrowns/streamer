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
}: UsePlayerHotkeysArgs) {
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
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
  ]);
}

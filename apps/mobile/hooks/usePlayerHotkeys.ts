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
}

export function usePlayerHotkeys({
  player,
  showControls,
  setSeekFeedback,
  seekFeedbackTimer,
  SEEK_SECONDS,
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
          const videoElement = document.querySelector("video");
          if (videoElement) {
            if (!document.fullscreenElement) {
              videoElement.requestFullscreen().catch(console.error);
            } else {
              document.exitFullscreen().catch(console.error);
            }
          }
          break;
        case "m":
          e.preventDefault();
          if (player) {
            player.muted = !player.muted;
            showControls();
          }
          break;
        case "arrowleft":
        case "j":
          e.preventDefault();
          player?.seekBy(-SEEK_SECONDS);
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
          player?.seekBy(SEEK_SECONDS);
          setSeekFeedback("right");
          if (seekFeedbackTimer.current)
            clearTimeout(seekFeedbackTimer.current);
          seekFeedbackTimer.current = setTimeout(
            () => setSeekFeedback(null),
            600,
          );
          showControls();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [player, showControls, setSeekFeedback, seekFeedbackTimer, SEEK_SECONDS]);
}

import { useEffect, useRef } from "react";
import { usePlayerStore } from "../stores/playerStore";
import { useTrakt } from "./useTrakt";
import { api } from "../services/api";

export function useTraktScrobbler() {
  const { connected } = useTrakt();
  const { isPlaying, currentTime, duration, mediaInfo } = usePlayerStore();
  const lastActionRef = useRef<"start" | "pause" | "stop" | null>(null);
  const lastProgressRef = useRef<number>(0);

  const scrobble = async (action: "start" | "pause" | "stop") => {
    if (!connected || !mediaInfo) return;

    try {
      const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

      // Don't send minor progress updates too frequently (min 1% or 1 minute)
      if (
        action === "start" &&
        Math.abs(progress - lastProgressRef.current) < 1
      ) {
        return;
      }

      await api.post(`/api/trakt/scrobble/${action}`, {
        type: mediaInfo.type,
        itemId: mediaInfo.itemId,
        title: mediaInfo.title,
        progress: Math.min(Math.round(progress), 100),
        season: mediaInfo.season,
        episode: mediaInfo.episode,
      });

      lastActionRef.current = action;
      lastProgressRef.current = progress;
    } catch (err) {
      console.error(`Failed to scrobble ${action} to Trakt:`, err);
    }
  };

  // Handle Play/Pause transitions
  useEffect(() => {
    if (!connected || !mediaInfo) return;

    if (isPlaying) {
      scrobble("start");
    } else {
      // Only pause if we were previously starting
      if (lastActionRef.current === "start") {
        scrobble("pause");
      }
    }
  }, [isPlaying, connected, !!mediaInfo]);

  // Handle Periodic Updates (every ~1 minute if playing)
  useEffect(() => {
    if (!isPlaying || !connected || !mediaInfo) return;

    const interval = setInterval(() => {
      scrobble("start");
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [isPlaying, connected, !!mediaInfo]);

  // Handle Stop/Cleanup
  useEffect(() => {
    return () => {
      // We can't easily wait for scrobble("stop") here because the component is unmounting
      // but we can try to fire it-the backend handles it better if we do.
      if (connected && mediaInfo && lastActionRef.current === "start") {
        scrobble("stop");
      }
    };
  }, [connected, !!mediaInfo]);

  return { scrobble };
}

import { useCallback, useState } from "react";
import type { Router } from "expo-router";
import type { Stream } from "@streamer/shared";

import { goBackOrReplace } from "../lib/navigation";
import { stopCastSession } from "../services/playback/PlaybackSessionCastService";
import { useCastStore, type ActiveCastSession } from "../stores/castStore";

interface UsePlayerCastControllerOptions {
  router: Router;
  currentStream: Stream | null;
}

export function usePlayerCastController({
  router,
  currentStream,
}: UsePlayerCastControllerOptions) {
  const activeCast = useCastStore((state) => state.activeCast);
  const setActiveCast = useCastStore((state) => state.setActiveCast);
  const clearActiveCast = useCastStore((state) => state.clearActiveCast);
  const [castModalOpen, setCastModalOpen] = useState(false);

  const canOpenCastModal = !activeCast;
  const shouldClosePlayerAfterStop = !currentStream;

  const openCastModal = useCallback(() => {
    if (canOpenCastModal) {
      setCastModalOpen(true);
    }
  }, [canOpenCastModal]);

  const closeCastModal = useCallback(() => {
    setCastModalOpen(false);
  }, []);

  const handleCastStarted = useCallback(
    (cast: ActiveCastSession) => {
      setActiveCast(cast);
      setCastModalOpen(false);
    },
    [setActiveCast],
  );

  const stopCasting = useCallback(async () => {
    if (!activeCast) return;

    try {
      await stopCastSession(activeCast.device.id, activeCast.sessionId);
    } catch (error) {
      console.error("Failed to stop cast", error);
    } finally {
      clearActiveCast();
      if (shouldClosePlayerAfterStop) {
        goBackOrReplace(router);
      }
    }
  }, [activeCast, clearActiveCast, router, shouldClosePlayerAfterStop]);

  const stopCastingOnPlayerClose = useCallback(() => {
    if (!activeCast) return;

    void stopCastSession(activeCast.device.id, activeCast.sessionId).catch(
      (error) => console.error("Failed to stop cast", error),
    );
    clearActiveCast();
  }, [activeCast, clearActiveCast]);

  return {
    activeCast,
    castModalOpen,
    canOpenCastModal,
    shouldClosePlayerAfterStop,
    openCastModal,
    closeCastModal,
    handleCastStarted,
    stopCasting,
    stopCastingOnPlayerClose,
  };
}

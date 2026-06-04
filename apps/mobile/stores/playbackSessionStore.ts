import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  playbackSessionSchema,
  type PlaybackAttempt,
  type PlaybackGatewayPhase,
  type PlaybackRuntimeError,
  type PlaybackSession,
  type PlannedMediaCandidate,
} from "@streamer/shared";
import {
  createPlaybackSessionEvent,
  createPlaybackSessionFromPlan,
  reducePlaybackSession,
  toPlaybackSessionError,
  type CreatePlaybackSessionInput,
  type PlaybackSessionEventInput,
  type PlaybackSessionRuntime,
} from "../services/playback/PlaybackSessionReducer";

const TERMINAL_STATUSES = new Set<PlaybackSession["status"]>([
  "completed",
  "failed",
  "cancelled",
]);

const runtimeBySession = new Map<string, PlaybackSessionRuntime>();

function factoryOptions() {
  return {
    idFactory: () => Crypto.randomUUID(),
    now: () => new Date().toISOString(),
  };
}

function requireSession(
  sessions: Record<string, PlaybackSession>,
  sessionId: string,
) {
  const session = sessions[sessionId];
  if (!session) {
    throw new Error(`Playback session ${sessionId} does not exist.`);
  }
  return session;
}

function sanitizePersistedSessions(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, PlaybackSession>;
  }

  const sessions: Record<string, PlaybackSession> = {};
  for (const session of Object.values(value)) {
    const result = playbackSessionSchema.safeParse(session);
    if (result.success) {
      sessions[result.data.id] = result.data;
    }
  }
  return sessions;
}

function hasCompleteRuntimeCandidateMap(
  sessionId: string,
  session: PlaybackSession,
) {
  const runtime = runtimeBySession.get(sessionId);
  return (
    !!runtime &&
    session.candidates.every((candidate) => !!runtime.candidates[candidate.id])
  );
}

export interface PlaybackSessionStoreState {
  sessions: Record<string, PlaybackSession>;
  activeSessionId: string | null;

  createSession: (input: CreatePlaybackSessionInput) => PlaybackSession;
  dispatchPlaybackEvent: (
    sessionId: string,
    event: PlaybackSessionEventInput,
  ) => PlaybackSession;
  startAttempt: (sessionId: string, candidateId: string) => PlaybackAttempt;
  recordGatewayProgress: (
    sessionId: string,
    gatewayJobId: string,
    phase: PlaybackGatewayPhase,
    progress?: number,
    peerCount?: number,
  ) => PlaybackSession;
  recordDownloadProgress: (
    sessionId: string,
    progress: number,
    totalBytesWritten?: number,
    totalBytesExpectedToWrite?: number,
  ) => PlaybackSession;
  recordDownloadVerified: (sessionId: string) => PlaybackSession;
  recordFallback: (
    sessionId: string,
    fromCandidateId: string,
    toCandidateId: string,
    reason: string,
  ) => PlaybackSession;
  failSession: (
    sessionId: string,
    error: PlaybackRuntimeError,
  ) => PlaybackSession;
  completeSession: (sessionId: string) => PlaybackSession;
  cancelSession: (sessionId: string, reason?: string) => PlaybackSession;
  setActiveSession: (sessionId: string | null) => void;
  getRuntimeCandidate: (
    sessionId: string,
    candidateId: string,
  ) => PlannedMediaCandidate | null;
  getRuntimePlan: (sessionId: string) => PlaybackSessionRuntime["plan"] | null;
  hasRuntimeCandidates: (sessionId: string) => boolean;
  requiresReplan: (sessionId: string) => boolean;
  clearRuntimeState: (sessionId?: string) => void;
  removeSession: (sessionId: string) => void;
  clearTerminalSessions: () => void;
  clearAllSessions: () => void;
}

export const usePlaybackSessionStore = create<PlaybackSessionStoreState>()(
  persist(
    (set, get) => ({
      sessions: {},
      activeSessionId: null,

      createSession: (input) => {
        const bundle = createPlaybackSessionFromPlan(input, factoryOptions());
        runtimeBySession.set(bundle.session.id, bundle.runtime);
        set((state) => ({
          sessions: {
            ...state.sessions,
            [bundle.session.id]: bundle.session,
          },
          activeSessionId: bundle.session.id,
        }));
        return bundle.session;
      },

      dispatchPlaybackEvent: (sessionId, eventInput) => {
        const currentSession = requireSession(get().sessions, sessionId);
        const event = createPlaybackSessionEvent(
          sessionId,
          eventInput,
          factoryOptions(),
        );
        const nextSession = reducePlaybackSession(currentSession, event);
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: nextSession,
          },
        }));
        return nextSession;
      },

      startAttempt: (sessionId, candidateId) => {
        const attemptId = Crypto.randomUUID();
        const session = get().dispatchPlaybackEvent(sessionId, {
          type: "attempt_started",
          attemptId,
          candidateId,
        });
        return session.attempts.find((attempt) => attempt.id === attemptId)!;
      },

      recordGatewayProgress: (
        sessionId,
        gatewayJobId,
        phase,
        progress,
        peerCount,
      ) =>
        get().dispatchPlaybackEvent(sessionId, {
          type: "gateway_progress",
          gatewayJobId,
          phase,
          progress,
          peerCount,
        }),

      recordDownloadProgress: (
        sessionId,
        progress,
        totalBytesWritten,
        totalBytesExpectedToWrite,
      ) =>
        get().dispatchPlaybackEvent(sessionId, {
          type: "download_progress",
          progress,
          totalBytesWritten,
          totalBytesExpectedToWrite,
        }),

      recordDownloadVerified: (sessionId) =>
        get().dispatchPlaybackEvent(sessionId, {
          type: "download_verified",
        }),

      recordFallback: (sessionId, fromCandidateId, toCandidateId, reason) =>
        get().dispatchPlaybackEvent(sessionId, {
          type: "fallback_started",
          fromCandidateId,
          toCandidateId,
          reason,
        }),

      failSession: (sessionId, error) =>
        get().dispatchPlaybackEvent(sessionId, {
          type: "session_failed",
          error: toPlaybackSessionError(error),
        }),

      completeSession: (sessionId) =>
        get().dispatchPlaybackEvent(sessionId, {
          type: "session_completed",
        }),

      cancelSession: (sessionId, reason) =>
        get().dispatchPlaybackEvent(sessionId, {
          type: "session_cancelled",
          reason,
        }),

      setActiveSession: (sessionId) => {
        if (sessionId) {
          requireSession(get().sessions, sessionId);
        }
        set({ activeSessionId: sessionId });
      },

      getRuntimeCandidate: (sessionId, candidateId) =>
        runtimeBySession.get(sessionId)?.candidates[candidateId] || null,

      getRuntimePlan: (sessionId) =>
        runtimeBySession.get(sessionId)?.plan || null,

      hasRuntimeCandidates: (sessionId) => {
        const session = get().sessions[sessionId];
        return (
          !!session &&
          session.candidates.length > 0 &&
          hasCompleteRuntimeCandidateMap(sessionId, session)
        );
      },

      requiresReplan: (sessionId) => {
        const session = get().sessions[sessionId];
        return (
          !!session &&
          !TERMINAL_STATUSES.has(session.status) &&
          session.candidates.length > 0 &&
          !hasCompleteRuntimeCandidateMap(sessionId, session)
        );
      },

      clearRuntimeState: (sessionId) => {
        if (sessionId) {
          runtimeBySession.delete(sessionId);
        } else {
          runtimeBySession.clear();
        }
        set((state) => ({ sessions: { ...state.sessions } }));
      },

      removeSession: (sessionId) => {
        runtimeBySession.delete(sessionId);
        set((state) => {
          const sessions = { ...state.sessions };
          delete sessions[sessionId];
          return {
            sessions,
            activeSessionId:
              state.activeSessionId === sessionId
                ? null
                : state.activeSessionId,
          };
        });
      },

      clearTerminalSessions: () => {
        set((state) => {
          const sessions: Record<string, PlaybackSession> = {};
          for (const [sessionId, session] of Object.entries(state.sessions)) {
            if (TERMINAL_STATUSES.has(session.status)) {
              runtimeBySession.delete(sessionId);
            } else {
              sessions[sessionId] = session;
            }
          }

          return {
            sessions,
            activeSessionId:
              state.activeSessionId && sessions[state.activeSessionId]
                ? state.activeSessionId
                : null,
          };
        });
      },

      clearAllSessions: () => {
        runtimeBySession.clear();
        set({ sessions: {}, activeSessionId: null });
      },
    }),
    {
      name: "playback-control-sessions",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as
          | Partial<PlaybackSessionStoreState>
          | undefined;
        const persistedSessions = sanitizePersistedSessions(
          persisted?.sessions,
        );
        const currentSessions = sanitizePersistedSessions(
          currentState.sessions,
        );
        const sessions = {
          ...persistedSessions,
          ...currentSessions,
        };
        const activeSessionId =
          currentState.activeSessionId && sessions[currentState.activeSessionId]
            ? currentState.activeSessionId
            : persisted?.activeSessionId && sessions[persisted.activeSessionId]
              ? persisted.activeSessionId
              : null;

        return {
          ...currentState,
          sessions,
          activeSessionId,
        };
      },
    },
  ),
);

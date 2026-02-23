import { create } from 'zustand';
import type { UserProfile } from '@streamer/shared';

interface AuthState {
    user: UserProfile | null;
    accessToken: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;

    setAuth: (user: UserProfile, accessToken: string, refreshToken: string) => void;
    setTokens: (accessToken: string, refreshToken: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,

    setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true }),

    setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

    logout: () =>
        set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
        }),
}));

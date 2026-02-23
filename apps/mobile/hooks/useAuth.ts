import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/authService';
import type { LoginRequest, RegisterRequest } from '@streamer/shared';

export function useAuth() {
    const { user, isAuthenticated, setAuth, logout: storeLogout } = useAuthStore();
    const queryClient = useQueryClient();

    const loginMutation = useMutation({
        mutationFn: (data: LoginRequest) => authService.login(data),
        onSuccess: (result) => {
            setAuth(result.user, result.tokens.accessToken, result.tokens.refreshToken);
        },
    });

    const registerMutation = useMutation({
        mutationFn: (data: RegisterRequest) => authService.register(data),
        onSuccess: (result) => {
            setAuth(result.user, result.tokens.accessToken, result.tokens.refreshToken);
        },
    });

    const logout = () => {
        storeLogout();
        queryClient.clear();
    };

    return {
        user,
        isAuthenticated,
        login: loginMutation.mutateAsync,
        register: registerMutation.mutateAsync,
        logout,
        isLoading: loginMutation.isPending || registerMutation.isPending,
        error: loginMutation.error || registerMutation.error,
    };
}

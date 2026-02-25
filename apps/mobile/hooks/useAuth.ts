import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/authService';
import type {
    LoginRequest,
    RegisterRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
    UpdateProfileRequest
} from '@streamer/shared';

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

    const forgotPasswordMutation = useMutation({
        mutationFn: (data: ForgotPasswordRequest) => authService.forgotPassword(data),
    });

    const resetPasswordMutation = useMutation({
        mutationFn: (data: ResetPasswordRequest) => authService.resetPassword(data),
    });

    const changePasswordMutation = useMutation({
        mutationFn: (data: ChangePasswordRequest) => authService.changePassword(data),
    });

    const updateProfileMutation = useMutation({
        mutationFn: (data: UpdateProfileRequest) => authService.updateProfile(data),
        onSuccess: (result) => {
            if (user) {
                // Keep the existing tokens, just update the user object
                const accessToken = useAuthStore.getState().accessToken;
                const refreshToken = useAuthStore.getState().refreshToken;
                if (accessToken && refreshToken) {
                    setAuth(result.user, accessToken, refreshToken);
                }
            }
        },
    });

    return {
        user,
        isAuthenticated,
        login: loginMutation.mutateAsync,
        register: registerMutation.mutateAsync,
        forgotPassword: forgotPasswordMutation.mutateAsync,
        resetPassword: resetPasswordMutation.mutateAsync,
        changePassword: changePasswordMutation.mutateAsync,
        updateProfile: updateProfileMutation.mutateAsync,
        logout,
        isLoading: loginMutation.isPending || registerMutation.isPending,
        error: loginMutation.error || registerMutation.error,
    };
}

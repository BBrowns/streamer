import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../stores/authStore";
import { authService } from "../services/authService";
import { api } from "../services/api";
import type {
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  UpdateProfileRequest,
} from "@streamer/shared";

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const pendingAddonUrls = useAuthStore((s) => s.pendingAddonUrls);
  const resetPendingAddons = useAuthStore((s) => s.resetPendingAddons);
  const storeLogout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  const flushPendingAddons = async () => {
    if (pendingAddonUrls.length === 0) return;
    try {
      for (const url of pendingAddonUrls) {
        await api.post("/api/addons", { transportUrl: url });
      }
      resetPendingAddons();
    } catch (e) {
      if (__DEV__)
        console.error("[useAuth] Failed to flush pending addons:", e);
    }
  };

  const loginMutation = useMutation({
    mutationFn: (data: LoginRequest) => authService.login(data),
    onSuccess: (result) => {
      setAuth(
        result.user,
        result.tokens.accessToken,
        result.tokens.refreshToken,
      );
      flushPendingAddons();
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterRequest) => authService.register(data),
    onSuccess: (result) => {
      if (result.tokens) {
        setAuth(
          result.user,
          result.tokens.accessToken,
          result.tokens.refreshToken,
        );
        flushPendingAddons();
      }
    },
  });

  const logout = () => {
    storeLogout();
    queryClient.clear();
  };

  const forgotPasswordMutation = useMutation({
    mutationFn: (data: ForgotPasswordRequest) =>
      authService.forgotPassword(data),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (data: ResetPasswordRequest) => authService.resetPassword(data),
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: ChangePasswordRequest) =>
      authService.changePassword(data),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: UpdateProfileRequest) => authService.updateProfile(data),
    onSuccess: (result) => {
      // Use tokens already in reactive state — no need for getState()
      if (accessToken && refreshToken) {
        setAuth(result.user, accessToken, refreshToken);
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
    isUpdatePending: updateProfileMutation.isPending,
    error: loginMutation.error || registerMutation.error,
    updateError: updateProfileMutation.error,
  };
}

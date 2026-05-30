import { getApiClient } from "./api-client";
import type {
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  UpdateProfileRequest,
  RegisterResponse,
  LoginResponse,
  AuthTokens,
  UserProfile,
} from "@streamer/shared";

async function readAuthResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (response.ok) {
    return payload as T;
  }

  const detailMessage =
    payload?.details?.[0]?.message ||
    payload?.error ||
    payload?.message ||
    fallbackMessage;

  throw new Error(detailMessage);
}

const authClient = () => getApiClient() as any;

export const authService = {
  register: async (data: RegisterRequest) => {
    const res = await authClient().api.auth.register.$post({ json: data });
    return readAuthResponse<RegisterResponse>(res, "Registration failed");
  },

  login: async (data: LoginRequest) => {
    const res = await authClient().api.auth.login.$post({ json: data });
    return readAuthResponse<LoginResponse>(res, "Login failed");
  },

  refresh: async (refreshToken: string) => {
    const res = await authClient().api.auth.refresh.$post({
      json: { refreshToken },
    });
    return readAuthResponse<AuthTokens>(res, "Refresh failed");
  },

  forgotPassword: async (data: ForgotPasswordRequest) => {
    const res = await authClient().api.auth["forgot-password"].$post({
      json: data,
    });
    return readAuthResponse<{ message?: string; resetToken?: string }>(
      res,
      "Forgot password request failed",
    );
  },

  resetPassword: async (data: ResetPasswordRequest) => {
    const res = await authClient().api.auth["reset-password"].$post({
      json: data,
    });
    return readAuthResponse<{ message: string }>(res, "Reset password failed");
  },

  changePassword: async (data: ChangePasswordRequest) => {
    const res = await authClient().api.auth["change-password"].$post({
      json: data,
    });
    return readAuthResponse<{ message: string }>(res, "Change password failed");
  },

  updateProfile: async (data: UpdateProfileRequest) => {
    const res = await authClient().api.auth.profile.$patch({ json: data });
    return readAuthResponse<{ user: UserProfile }>(
      res,
      "Profile update failed",
    );
  },

  verifyEmail: async (data: { token: string }) => {
    const res = await authClient().api.auth["verify-email"].$post({
      json: data,
    });
    return readAuthResponse<{ message: string }>(
      res,
      "Email verification failed",
    );
  },

  resendVerification: async (data: { email: string }) => {
    const res = await authClient().api.auth["resend-verification"].$post({
      json: data,
    });
    return readAuthResponse<{ message: string }>(
      res,
      "Resend verification failed",
    );
  },
};

import { client as untypedClient } from "./api-client";
const client = untypedClient as any;
import type {
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  UpdateProfileRequest,
} from "@streamer/shared";

export const authService = {
  register: async (data: RegisterRequest) => {
    const res = await client.api.auth.register.$post({ json: data });
    if (!res.ok) throw new Error("Registration failed");
    return res.json();
  },

  login: async (data: LoginRequest) => {
    const res = await client.api.auth.login.$post({ json: data });
    if (!res.ok) throw new Error("Login failed");
    return res.json();
  },

  refresh: async (refreshToken: string) => {
    const res = await client.api.auth.refresh.$post({ json: { refreshToken } });
    if (!res.ok) throw new Error("Refresh failed");
    return res.json();
  },

  forgotPassword: async (data: ForgotPasswordRequest) => {
    const res = await client.api.auth.forgot_password.$post({ json: data });
    if (!res.ok) throw new Error("Forgot password request failed");
    return res.json();
  },

  resetPassword: async (data: ResetPasswordRequest) => {
    const res = await client.api.auth.reset_password.$post({ json: data });
    if (!res.ok) throw new Error("Reset password failed");
    return res.json();
  },

  changePassword: async (data: ChangePasswordRequest) => {
    const res = await client.api.auth.change_password.$post({ json: data });
    if (!res.ok) throw new Error("Change password failed");
    return res.json();
  },

  updateProfile: async (data: UpdateProfileRequest) => {
    const res = await client.api.auth.profile.$patch({ json: data });
    if (!res.ok) throw new Error("Profile update failed");
    return res.json();
  },

  verifyEmail: async (data: { token: string }) => {
    const res = await client.api.auth.verify_email.$post({ json: data });
    if (!res.ok) throw new Error("Email verification failed");
    return res.json();
  },

  resendVerification: async (data: { email: string }) => {
    const res = await client.api.auth.resend_verification.$post({ json: data });
    if (!res.ok) throw new Error("Resend verification failed");
    return res.json();
  },
};

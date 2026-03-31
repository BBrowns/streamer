import { api } from "../services/api";
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
    const response = await api.post("/api/auth/register", data);
    return response.data;
  },

  login: async (data: LoginRequest) => {
    const response = await api.post("/api/auth/login", data);
    return response.data;
  },

  refresh: async (refreshToken: string) => {
    const response = await api.post("/api/auth/refresh", { refreshToken });
    return response.data;
  },

  forgotPassword: async (data: ForgotPasswordRequest) => {
    const response = await api.post("/api/auth/forgot-password", data);
    return response.data;
  },

  resetPassword: async (data: ResetPasswordRequest) => {
    const response = await api.post("/api/auth/reset-password", data);
    return response.data;
  },

  changePassword: async (data: ChangePasswordRequest) => {
    const response = await api.post("/api/auth/change-password", data);
    return response.data;
  },

  updateProfile: async (data: UpdateProfileRequest) => {
    const response = await api.patch("/api/auth/profile", data);
    return response.data;
  },

  verifyEmail: async (data: { token: string }) => {
    const response = await api.post("/api/auth/verify-email", data);
    return response.data;
  },

  resendVerification: async (data: { email: string }) => {
    const response = await api.post("/api/auth/resend-verification", data);
    return response.data;
  },
};

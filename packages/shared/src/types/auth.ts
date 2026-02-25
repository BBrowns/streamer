/** Auth request/response types */
export interface RegisterRequest {
    email: string;
    password: string;
    displayName?: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export interface RefreshRequest {
    refreshToken: string;
}

export interface UserProfile {
    id: string;
    email: string;
    displayName?: string;
    createdAt: string;
}

export interface ForgotPasswordRequest {
    email: string;
}

export interface ResetPasswordRequest {
    token: string;
    newPassword: string;
}

export interface ChangePasswordRequest {
    currentPassword: string;
    newPassword: string;
}

export interface UpdateProfileRequest {
    displayName?: string;
}

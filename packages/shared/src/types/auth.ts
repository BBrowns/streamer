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

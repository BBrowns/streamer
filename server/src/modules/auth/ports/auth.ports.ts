import type { AuthTokens, UserProfile } from '@streamer/shared';

/** Port: User persistence operations */
export interface IAuthRepository {
    findByEmail(email: string): Promise<AuthUserRecord | null>;
    findById(id: string): Promise<AuthUserRecord | null>;
    create(data: { email: string; passwordHash: string; displayName?: string }): Promise<AuthUserRecord>;
    updatePassword(userId: string, passwordHash: string): Promise<void>;
    updateProfile(userId: string, data: { displayName?: string }): Promise<AuthUserRecord>;
}

/** Port: Refresh token persistence */
export interface IRefreshTokenRepository {
    create(data: { token: string; userId: string; expiresAt: Date }): Promise<void>;
    findByToken(token: string): Promise<StoredRefreshToken | null>;
    deleteByToken(tokenId: string): Promise<void>;
    deleteAllForUser(userId: string): Promise<void>;
}

/** Port: Password reset token persistence */
export interface IPasswordResetRepository {
    create(data: { token: string; userId: string; expiresAt: Date }): Promise<void>;
    findByToken(token: string): Promise<StoredResetToken | null>;
    deleteByToken(tokenId: string): Promise<void>;
    deleteAllForUser(userId: string): Promise<void>;
}

/** Port: Token generation (JWT, etc.) */
export interface ITokenGenerator {
    generateAccessToken(userId: string, email: string): string;
    generateRefreshToken(): string;
    verifyAccessToken(token: string): { userId: string; email: string };
}

/** Port: Password hashing */
export interface IPasswordHasher {
    hash(password: string): Promise<string>;
    compare(password: string, hash: string): Promise<boolean>;
}

/** Internal domain record for a user */
export interface AuthUserRecord {
    id: string;
    email: string;
    passwordHash: string;
    displayName: string | null;
    createdAt: Date;
}

/** Stored refresh token record */
export interface StoredRefreshToken {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
    user: AuthUserRecord;
}

/** Stored password reset token record */
export interface StoredResetToken {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
    user: AuthUserRecord;
}

export interface RealDebridStatus {
  configured: boolean;
  connected: boolean;
  isPremium?: boolean;
  expiresAt?: string;
}

export interface RealDebridDeviceFlow {
  flowId: string;
  userCode: string;
  verificationUrl: string;
  expiresAt: string;
  intervalSeconds: number;
}

export type RealDebridDevicePollResult =
  | { status: "pending"; retryAfterSeconds: number }
  | { status: "expired" }
  | { status: "connected"; expiresAt: string };

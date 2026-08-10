import { useAuthStore } from "../stores/authStore";

export interface DesktopBridgeAccessSession {
  accessToken: string;
  expiresAt: string;
}

let desktopBridgeAccessSession: DesktopBridgeAccessSession | null = null;

export function setDesktopBridgeAccessSession(
  session: DesktopBridgeAccessSession | null | undefined,
) {
  desktopBridgeAccessSession = session ?? null;
}

function getDesktopBridgeAccessToken() {
  if (!desktopBridgeAccessSession) return null;
  const expiresAt = Date.parse(desktopBridgeAccessSession.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    desktopBridgeAccessSession = null;
    return null;
  }
  return desktopBridgeAccessSession.accessToken.trim() || null;
}

export function getBridgeAuthHeaders(): Record<string, string> {
  const token =
    getDesktopBridgeAccessToken() ||
    useAuthStore.getState().streamServerToken?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function refreshDesktopBridgeAccessSession(): Promise<boolean> {
  if (typeof window === "undefined" || !window.desktopBridge) return false;

  try {
    const session = window.desktopBridge.refreshBridgeAccessSession
      ? await window.desktopBridge.refreshBridgeAccessSession()
      : (await window.desktopBridge.getBridgeInfo()).accessSession;
    setDesktopBridgeAccessSession(session);
    return Boolean(getDesktopBridgeAccessToken());
  } catch {
    setDesktopBridgeAccessSession(null);
    return false;
  }
}

export function __resetDesktopBridgeAccessSessionForTests() {
  desktopBridgeAccessSession = null;
}

export function withBridgeJsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...getBridgeAuthHeaders(),
  };
}

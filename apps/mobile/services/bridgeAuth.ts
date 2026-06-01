import { useAuthStore } from "../stores/authStore";

export function getBridgeAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().streamServerToken?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function withBridgeJsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...getBridgeAuthHeaders(),
  };
}

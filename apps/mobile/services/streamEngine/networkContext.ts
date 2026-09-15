import { Platform } from "react-native";

export type NetworkContextKind =
  "wifi" | "ethernet" | "cellular" | "vpn" | "none" | "unknown";

export interface NetworkContextHint {
  kind: NetworkContextKind;
  online: boolean | null;
  effectiveType?: string;
  rttMs?: number;
}

type NavigatorWithConnection = Navigator & {
  connection?: {
    type?: string;
    effectiveType?: string;
    rtt?: number;
  };
};

function normalizeKind(value: unknown): NetworkContextKind {
  switch (String(value ?? "").toLowerCase()) {
    case "wifi":
      return "wifi";
    case "ethernet":
    case "wired":
      return "ethernet";
    case "cellular":
    case "cell":
      return "cellular";
    case "vpn":
      return "vpn";
    case "none":
      return "none";
    default:
      return "unknown";
  }
}

export async function getNetworkContextHint(): Promise<NetworkContextHint> {
  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    const connected = navigator.onLine;
    const connection = (navigator as NavigatorWithConnection).connection;
    return {
      kind: connected ? normalizeKind(connection?.type) : "none",
      online: connected,
      ...(connection?.effectiveType
        ? { effectiveType: connection.effectiveType }
        : {}),
      ...(typeof connection?.rtt === "number" && connection.rtt >= 0
        ? { rttMs: Math.round(connection.rtt) }
        : {}),
    };
  }

  try {
    const Network = await import("expo-network");
    const state = await Network.getNetworkStateAsync();
    const type = String(state.type ?? "").toLowerCase();
    return {
      kind: type.includes("wifi")
        ? "wifi"
        : type.includes("ethernet")
          ? "ethernet"
          : type.includes("cell")
            ? "cellular"
            : type.includes("vpn")
              ? "vpn"
              : state.isConnected === false
                ? "none"
                : "unknown",
      online:
        typeof state.isInternetReachable === "boolean"
          ? state.isInternetReachable
          : typeof state.isConnected === "boolean"
            ? state.isConnected
            : null,
    };
  } catch {
    return { kind: "unknown", online: null };
  }
}

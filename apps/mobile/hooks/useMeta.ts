import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { MetaDetail } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

export type MetaLoadFailureKind = "notFound" | "network" | "temporary";

type HttpLikeError = {
  code?: unknown;
  message?: unknown;
  request?: unknown;
  response?: { status?: unknown };
  status?: unknown;
};

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as HttpLikeError;
  const status = candidate.response?.status ?? candidate.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Translate transport failures into the three recovery states the Detail UI
 * can act on. Keep this independent from Axios so native and web failures are
 * classified consistently.
 */
export function getMetaLoadFailureKind(error: unknown): MetaLoadFailureKind {
  const status = getErrorStatus(error);
  if (status === 404) return "notFound";

  if (error && typeof error === "object") {
    const candidate = error as HttpLikeError;
    const code =
      typeof candidate.code === "string" ? candidate.code.toUpperCase() : "";
    const message =
      typeof candidate.message === "string"
        ? candidate.message.toLowerCase()
        : "";
    const hasNetworkSignature =
      candidate.request !== undefined ||
      ["ERR_NETWORK", "ECONNABORTED", "ECONNRESET", "ETIMEDOUT"].includes(
        code,
      ) ||
      message.includes("network error") ||
      message.includes("network request failed") ||
      message.includes("timeout");

    if (status === undefined && hasNetworkSignature) return "network";
  }

  return "temporary";
}

function shouldRetryMetaRequest(failureCount: number, error: unknown) {
  const status = getErrorStatus(error);
  if (status === 404) return false;
  if (
    status !== undefined &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  ) {
    return false;
  }
  return failureCount < 2;
}

export function useMeta(type: string, id: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery<MetaDetail>({
    queryKey: ["meta", type, id],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ meta?: MetaDetail }>(
        `/api/meta/${type}/${id}`,
        { signal },
      );
      if (!data.meta) {
        const notFoundError = new Error("Metadata not found") as Error & {
          status: number;
        };
        notFoundError.status = 404;
        throw notFoundError;
      }
      return data.meta;
    },
    staleTime: 10 * 60 * 1000, // 10 min cache — meta rarely changes
    gcTime: 60 * 60 * 1000, // Keep for 1 hour
    retry: shouldRetryMetaRequest,
    refetchOnReconnect: true,
    enabled: isAuthenticated && !!type && !!id,
  });
}

import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { InstalledAddon } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

export const addonQueryKeys = {
  all: ["addons"] as const,
  list: (userId: string | null | undefined) =>
    ["addons", userId ?? "anonymous"] as const,
};

/**
 * Keep an installation visible while its follow-up list request refreshes.
 * React Query otherwise preserves a previous empty list until the network
 * invalidation completes, which makes a newly added catalog look ineffective.
 */
export function upsertInstalledAddon(
  previous: readonly InstalledAddon[] | undefined,
  addon: InstalledAddon,
): InstalledAddon[] {
  const withoutExisting = (previous ?? []).filter(
    (candidate) => candidate.id !== addon.id,
  );

  return [addon, ...withoutExisting].sort(
    (left, right) =>
      right.installedAt.localeCompare(left.installedAt) ||
      right.id.localeCompare(left.id),
  );
}

export function removeInstalledAddon(
  previous: readonly InstalledAddon[] | undefined,
  addonId: string,
): InstalledAddon[] {
  return (previous ?? []).filter((addon) => addon.id !== addonId);
}

export function useAddons() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery<InstalledAddon[]>({
    queryKey: addonQueryKeys.list(userId),
    queryFn: async () => {
      const { data } = await api.get("/api/addons");
      return data.addons;
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000, // 2 min cache
    gcTime: 30 * 60 * 1000, // Keep in garbage collection for 30 min
    retry: 2,
    refetchOnReconnect: true,
  });
}

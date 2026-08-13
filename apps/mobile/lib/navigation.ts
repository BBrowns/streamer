import type { Href, useRouter } from "expo-router";

export type Router = ReturnType<typeof useRouter>;

export function goBackOrReplace(router: Router, fallback: Href = "/") {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    /* fall through to the stable fallback route */
  }

  router.replace(fallback);
}

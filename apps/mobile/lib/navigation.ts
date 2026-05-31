import type { Href, Router } from "expo-router";

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

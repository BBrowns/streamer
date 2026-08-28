import type {
  StreamerBreadcrumbCategory,
  StreamerBreadcrumbLevel,
} from "@streamer/shared";
import { addMobileBreadcrumb } from "../sentryBreadcrumbs";

type PlaybackDebugCategory = Extract<
  StreamerBreadcrumbCategory,
  "playback" | "gateway"
>;

export type PlaybackDebugData = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

export interface PlaybackDebugEvent {
  category: PlaybackDebugCategory;
  message: string;
  level?: StreamerBreadcrumbLevel;
  data?: PlaybackDebugData;
}

function shouldWriteDevelopmentLog() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.NODE_ENV === "test"
  ) {
    return false;
  }
  return (
    process.env.NODE_ENV === "development" ||
    (typeof __DEV__ !== "undefined" && __DEV__)
  );
}

/**
 * Emits a bounded set of playback boundary events that are useful in a local
 * development log. The breadcrumb sanitizer runs before console output, so
 * transient source URLs, magnets, and credentials cannot enter pasted logs.
 */
export function recordPlaybackDebugEvent(event: PlaybackDebugEvent) {
  const breadcrumb = addMobileBreadcrumb(event);
  if (shouldWriteDevelopmentLog()) {
    const details = breadcrumb.data
      ? ` ${JSON.stringify(breadcrumb.data)}`
      : "";
    console.info(`[${breadcrumb.category}] ${breadcrumb.message}${details}`);
  }
  return breadcrumb;
}

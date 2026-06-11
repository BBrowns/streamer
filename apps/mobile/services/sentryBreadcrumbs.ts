import * as Sentry from "@sentry/react-native";
import {
  createStreamerBreadcrumb,
  type StreamerBreadcrumbCategory,
  type StreamerBreadcrumbLevel,
} from "@streamer/shared";

export interface MobileBreadcrumbInput {
  category: StreamerBreadcrumbCategory;
  message: string;
  level?: StreamerBreadcrumbLevel;
  data?: Record<string, unknown>;
}

export function addMobileBreadcrumb(input: MobileBreadcrumbInput) {
  const breadcrumb = createStreamerBreadcrumb(input);
  Sentry.addBreadcrumb(breadcrumb as Sentry.Breadcrumb);
  return breadcrumb;
}

import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useWindowClass } from "../../hooks/useWindowClass";
import type { ContentBoundarySize } from "./ContentBoundary";
import { PageHeader } from "./PageHeader";
import { PageLayout } from "./PageLayout";

type AdaptiveRoutePageProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  boundary?: ContentBoundarySize;
  scroll?: boolean;
  testID?: string;
  boundaryStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Shared content shell for secondary routes. The route owns Stack.Screen and
 * decides whether the native header is shown; this shell only changes the
 * editorial title to supporting copy when navigation owns the title.
 */
export function AdaptiveRoutePage({
  title,
  eyebrow,
  description,
  actions,
  boundary = "content",
  scroll = false,
  testID,
  boundaryStyle,
  children,
}: AdaptiveRoutePageProps) {
  const { isLarge } = useWindowClass();

  return (
    <PageLayout
      boundary={boundary}
      scroll={scroll}
      testID={testID}
      boundaryStyle={boundaryStyle}
    >
      <PageHeader
        testID="adaptive-route-page-header"
        title={title}
        eyebrow={eyebrow}
        description={description}
        actions={actions}
        compact={!isLarge}
        titleVisibility={isLarge ? "visible" : "navigation-owned"}
      />
      {children}
    </PageLayout>
  );
}

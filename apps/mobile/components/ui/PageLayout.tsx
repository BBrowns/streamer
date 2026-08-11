import type { ReactNode } from "react";
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { ContentBoundary, type ContentBoundarySize } from "./ContentBoundary";
import { uiSpacing } from "./designSystem";

type PageLayoutProps = {
  children: ReactNode;
  scroll?: boolean;
  contained?: boolean;
  boundary?: ContentBoundarySize | false;
  maxWidth?: number;
  boundaryStyle?: StyleProp<ViewStyle>;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function PageLayout({
  children,
  scroll = false,
  contained = true,
  boundary,
  maxWidth,
  boundaryStyle,
  testID,
  style,
  contentContainerStyle,
}: PageLayoutProps) {
  const { colors } = useTheme();
  const shouldContain = boundary === undefined ? contained : boundary !== false;
  const content = shouldContain ? (
    <ContentBoundary
      size={boundary === undefined || boundary === false ? "content" : boundary}
      maxWidth={maxWidth}
      style={boundaryStyle}
    >
      {children}
    </ContentBoundary>
  ) : (
    children
  );

  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={[styles.page, { backgroundColor: colors.background }, style]}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View
      testID={testID}
      style={[styles.page, { backgroundColor: colors.background }, style]}
    >
      <View style={[styles.content, contentContainerStyle]}>{content}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: uiSpacing.xxl,
    paddingBottom: uiSpacing.section,
  },
});

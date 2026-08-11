import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { AdaptiveRoutePage } from "../ui/AdaptiveRoutePage";
import { uiSpacing, uiTypography } from "../ui/designSystem";

export type LegalDocumentSection = {
  title: string;
  body: string;
};

type LegalDocumentScreenProps = {
  title: string;
  lastUpdated: string;
  sections: LegalDocumentSection[];
  testID?: string;
  boundaryStyle?: StyleProp<ViewStyle>;
};

export function LegalDocumentScreen({
  title,
  lastUpdated,
  sections,
  testID,
  boundaryStyle,
}: LegalDocumentScreenProps) {
  const { colors } = useTheme();

  return (
    <AdaptiveRoutePage
      title={title}
      description={lastUpdated}
      boundary="reading"
      scroll
      testID={testID}
      boundaryStyle={[styles.content, boundaryStyle]}
    >
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.tint }]}>
            {section.title}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {section.body}
          </Text>
        </View>
      ))}
    </AdaptiveRoutePage>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: uiSpacing.xxl,
    paddingBottom: uiSpacing.section,
  },
  section: {
    marginBottom: uiSpacing.xxl,
  },
  sectionTitle: {
    ...uiTypography.title,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: uiSpacing.sm,
  },
  body: {
    ...uiTypography.body,
  },
});

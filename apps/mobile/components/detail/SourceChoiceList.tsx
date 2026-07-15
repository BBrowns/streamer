import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PlaybackPlan } from "@streamer/shared";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { createPlaybackPlanWithBridgeRetry } from "../../services/playback/PlaybackPlanService";
import { formatBytes } from "../downloads/downloadPresentation";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTypography,
} from "../ui/designSystem";
import { createSourceChoices, type SourceChoice } from "./sourceChoices";

export type SourceChoiceQuery = {
  contentType: "movie" | "series";
  contentId: string;
  season?: number;
  episode?: number;
};

export type SourceChoicePlanState = {
  plan: PlaybackPlan | null;
  choices: SourceChoice[];
  loading: boolean;
  error: string | null;
  retry: () => void;
};

type SourceChoiceListProps = {
  state: SourceChoicePlanState;
  onSelect: (plan: PlaybackPlan, candidateId: string) => void;
};

export function useSourceChoicePlan({
  contentType,
  contentId,
  season,
  episode,
}: SourceChoiceQuery): SourceChoicePlanState {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<PlaybackPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(0);

  const load = useCallback(() => setRequestId((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void createPlaybackPlanWithBridgeRetry({
      type: contentType,
      id: contentId,
      season,
      episode,
      action: "play",
    })
      .then((nextPlan) => {
        if (active) setPlan(nextPlan);
      })
      .catch((nextError: any) => {
        if (!active) return;
        setPlan(null);
        setError(
          nextError?.message ||
            t("detail.sources.choiceError", {
              defaultValue: "Sources could not be prepared.",
            }),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [contentId, contentType, episode, requestId, season, t]);

  const choices = useMemo(
    () => (plan ? createSourceChoices(plan) : []),
    [plan],
  );

  return { plan, choices, loading, error, retry: load };
}

export function SourceChoiceList({ state, onSelect }: SourceChoiceListProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { plan, choices, loading, error, retry } = state;

  if (loading) {
    return (
      <View style={styles.stateRow}>
        <ActivityIndicator color={colors.tint} />
        <Text style={[styles.stateText, { color: colors.textSecondary }]}>
          {t("detail.actionPanel.findingSources")}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.stateRow}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <Text style={[styles.stateText, { color: colors.textSecondary }]}>
          {error}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.retry")}
          onPress={retry}
          style={({ pressed, focused }: any) => [
            styles.retry,
            pressed && styles.pressed,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
        >
          <Text style={[styles.retryText, { color: colors.tint }]}>
            {t("common.retry")}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!plan || choices.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.textSecondary }]}>
        {t("detail.sources.noneConsumer", {
          defaultValue: "No compatible sources are available.",
        })}
      </Text>
    );
  }

  return (
    <View testID="source-choice-list" style={styles.list}>
      {choices.map((choice) => (
        <ChoiceRow
          key={choice.candidateId}
          choice={choice}
          onPress={() => onSelect(plan, choice.candidateId)}
        />
      ))}
    </View>
  );
}

function ChoiceRow({
  choice,
  onPress,
}: {
  choice: SourceChoice;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const compatibility =
    choice.compatibility === "ready"
      ? t("detail.sources.compatibility.ready", {
          defaultValue: "Ready on this device",
        })
      : choice.compatibility === "local-service"
        ? t("detail.sources.compatibility.localService", {
            defaultValue: "Uses Local Playback Service",
          })
        : t("detail.sources.compatibility.conversion", {
            defaultValue: "Prepared automatically",
          });
  const language =
    choice.language.kind === "not-listed"
      ? t("detail.sources.language.notListed", {
          defaultValue: "Language not listed",
        })
      : choice.language.kind === "multiple"
        ? t("detail.sources.language.multiple", {
            defaultValue: "Multiple languages",
          })
        : choice.language.code.toUpperCase();
  const quality =
    choice.quality.kind === "auto"
      ? t("detail.sources.quality.auto", { defaultValue: "Auto" })
      : choice.quality.value;
  const size = choice.sizeBytes ? formatBytes(choice.sizeBytes) : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[quality, size, language, compatibility]
        .filter(Boolean)
        .join(", ")}
      style={({ pressed, hovered, focused }: any) => [
        styles.choice,
        { backgroundColor: colors.surfaceElevated },
        hovered && { backgroundColor: colors.card },
        pressed && styles.pressed,
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
    >
      <View style={[styles.quality, { backgroundColor: colors.tint + "18" }]}>
        <Text style={[styles.qualityText, { color: colors.tint }]}>
          {quality}
        </Text>
      </View>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceTitle, { color: colors.text }]}>
          {[size, language].filter(Boolean).join(" · ")}
        </Text>
        <Text style={[styles.choiceMeta, { color: colors.textSecondary }]}>
          {compatibility}
        </Text>
      </View>
      <Ionicons name="play" size={17} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: uiSpacing.sm },
  choice: {
    minHeight: 64,
    borderRadius: uiRadii.card,
    paddingHorizontal: uiSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  quality: {
    minWidth: 48,
    minHeight: 36,
    borderRadius: uiRadii.control,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiSpacing.sm,
  },
  qualityText: { ...uiTypography.control },
  choiceCopy: { flex: 1, minWidth: 0 },
  choiceTitle: { ...uiTypography.label },
  choiceMeta: { ...uiTypography.caption, marginTop: 2 },
  stateRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  stateText: { ...uiTypography.caption, flex: 1 },
  retry: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: uiSpacing.sm,
  },
  retryText: { ...uiTypography.control },
  empty: { ...uiTypography.body, paddingVertical: uiSpacing.md },
  pressed: { opacity: 0.72 },
});

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PlaybackPlanResponse } from "@streamer/shared";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { getPlaybackPlanWithBridgeRetry } from "../../services/playback/PlaybackPlanService";
import { formatBytes } from "../downloads/downloadPresentation";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTypography,
} from "../ui/designSystem";
import {
  createSourceChoices,
  getSourceChoicePreview,
  type SourceChoice,
} from "./sourceChoices";

export type SourceChoiceQuery = {
  contentType: "movie" | "series";
  contentId: string;
  season?: number;
  episode?: number;
};

export type SourceChoicePlanState = {
  plan: PlaybackPlanResponse | null;
  choices: SourceChoice[];
  loading: boolean;
  error: string | null;
  retry: () => void;
};

type SourceChoiceListProps = {
  state: SourceChoicePlanState;
  onSelect: (plan: PlaybackPlanResponse, candidateId: string) => void;
  maxChoices?: number;
  showAll?: boolean;
  onShowAll?: () => void;
};

export function useSourceChoicePlan({
  contentType,
  contentId,
  season,
  episode,
}: SourceChoiceQuery): SourceChoicePlanState {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<PlaybackPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(0);

  const load = useCallback(() => setRequestId((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getPlaybackPlanWithBridgeRetry(
      {
        type: contentType,
        id: contentId,
        season,
        episode,
        action: "play",
      },
      requestId > 0 ? { forceRefresh: true } : undefined,
    )
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

export function SourceChoiceList({
  state,
  onSelect,
  maxChoices,
  showAll = false,
  onShowAll,
}: SourceChoiceListProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { plan, choices, loading, error, retry } = state;

  if (loading) {
    return (
      <View style={styles.stateRow}>
        <ActivityIndicator color={colors.textSecondary} />
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
          <Text style={[styles.retryText, { color: colors.text }]}>
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

  const visibleChoices =
    maxChoices !== undefined && !showAll
      ? getSourceChoicePreview(choices, maxChoices)
      : choices;
  const renderChoice = ({
    item,
    index,
  }: {
    item: SourceChoice;
    index: number;
  }) => (
    <ChoiceRow
      choice={item}
      isBestAvailable={index === 0}
      onPress={() => onSelect(plan, item.candidateId)}
    />
  );

  return (
    <View testID="source-choice-list" style={styles.list}>
      {showAll ? (
        <FlatList
          data={visibleChoices}
          keyExtractor={(choice) => choice.candidateId}
          renderItem={renderChoice}
          style={styles.fullList}
          contentContainerStyle={styles.fullListContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        visibleChoices.map((choice, index) => (
          <ChoiceRow
            key={choice.candidateId}
            choice={choice}
            isBestAvailable={index === 0}
            onPress={() => onSelect(plan, choice.candidateId)}
          />
        ))
      )}
      {maxChoices !== undefined &&
      choices.length > maxChoices &&
      !showAll &&
      onShowAll ? (
        <Pressable
          testID="source-choice-show-all"
          accessibilityRole="button"
          accessibilityLabel={t("detail.sources.showAll")}
          onPress={onShowAll}
          style={({ pressed, focused }: any) => [
            styles.showAll,
            pressed && styles.pressed,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
        >
          <Text style={[styles.showAllText, { color: colors.text }]}>
            {t("detail.sources.showAll", {
              count: choices.length,
              defaultValue: "Show all sources",
            })}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ChoiceRow({
  choice,
  isBestAvailable = false,
  onPress,
}: {
  choice: SourceChoice;
  isBestAvailable?: boolean;
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
      accessibilityLabel={[
        isBestAvailable
          ? t("detail.sources.bestAvailableLabel", {
              defaultValue: "Best available",
            })
          : null,
        quality,
        size,
        language,
        compatibility,
      ]
        .filter(Boolean)
        .join(", ")}
      style={({ pressed, hovered, focused }: any) => [
        styles.choice,
        { borderBottomColor: colors.borderSubtle ?? colors.border },
        hovered && { backgroundColor: colors.stateHover },
        pressed && styles.pressed,
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
    >
      <View style={styles.quality}>
        <Text style={[styles.qualityText, { color: colors.text }]}>
          {quality}
        </Text>
      </View>
      <View style={styles.choiceCopy}>
        {isBestAvailable ? (
          <Text style={[styles.bestLabel, { color: colors.textSecondary }]}>
            {t("detail.sources.bestAvailableLabel", {
              defaultValue: "Best available",
            })}
          </Text>
        ) : null}
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
  list: { gap: 0 },
  fullList: { maxHeight: 420 },
  fullListContent: { paddingBottom: uiSpacing.xs },
  choice: {
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: uiSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  quality: {
    minWidth: 48,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiSpacing.sm,
  },
  qualityText: { ...uiTypography.control },
  choiceCopy: { flex: 1, minWidth: 0 },
  bestLabel: { ...uiTypography.caption, fontWeight: "600" },
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
  showAll: {
    minHeight: 48,
    paddingHorizontal: uiSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  showAllText: { ...uiTypography.control },
  empty: { ...uiTypography.body, paddingVertical: uiSpacing.md },
  pressed: { opacity: 0.72 },
});

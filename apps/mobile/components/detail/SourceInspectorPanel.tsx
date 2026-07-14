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
import type {
  PlaybackAction,
  PlaybackPlan,
  PlannedMediaCandidate,
  RejectedCandidate,
} from "@streamer/shared";
import { createPlaybackPlanWithBridgeRetry } from "../../services/playback/PlaybackPlanService";
import {
  createDebugBundle,
  exportDebugBundle,
} from "../../services/debugBundle";
import { useTheme } from "../../hooks/useTheme";
import { useToastStore } from "../../stores/toastStore";
import { formatBytes } from "../downloads/downloadPresentation";
import { StatusPill } from "../ui/StatusPill";
import { getWebFocusStyle, uiRadii, uiTouchTarget } from "../ui/designSystem";

type SourceInspectorPanelProps = {
  contentType: "movie" | "series";
  contentId: string;
  title?: string;
  season?: number;
  episode?: number;
  initiallySelectedAction?: PlaybackAction;
};

const ACTIONS: { action: PlaybackAction; label: string; icon: string }[] = [
  { action: "play", label: "Play", icon: "play" },
  { action: "download", label: "Download", icon: "download-outline" },
  { action: "cast", label: "Cast", icon: "cast-outline" },
];

function formatCandidateLabel(candidate: PlannedMediaCandidate) {
  return [
    candidate.quality,
    candidate.container?.toUpperCase(),
    candidate.videoCodec?.toUpperCase(),
    candidate.audioCodec?.toUpperCase(),
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatSize(sizeBytes?: number) {
  return sizeBytes ? formatBytes(sizeBytes) : null;
}

function formatAction(action: PlaybackAction) {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function CandidateRow({
  candidate,
  selected,
}: {
  candidate: PlannedMediaCandidate;
  selected?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const size = formatSize(candidate.sizeBytes);
  const actionLabel = formatAction(candidate.actionEligibility.action);
  const eligibilityTone = candidate.actionEligibility.eligible
    ? "success"
    : "warning";

  return (
    <View
      style={[
        styles.candidateRow,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.045)"
            : "rgba(255,255,255,0.66)",
          borderColor: selected ? colors.tint : colors.border,
        },
      ]}
    >
      <View style={styles.candidateHeader}>
        <View style={styles.rankBubble}>
          <Text style={[styles.rankText, { color: colors.tint }]}>
            #{candidate.rank + 1}
          </Text>
        </View>
        <View style={styles.candidateTitleWrap}>
          <Text style={[styles.candidateTitle, { color: colors.text }]}>
            {candidate.kind.toUpperCase()} source
          </Text>
          <Text
            style={[styles.candidateMeta, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            Score {Math.round(candidate.score)} ·{" "}
            {formatCandidateLabel(candidate) || "Unknown media profile"}
            {size ? ` · ${size}` : ""}
            {candidate.seeders != null ? ` · ${candidate.seeders} peers` : ""}
          </Text>
        </View>
      </View>

      <View style={styles.pillRow}>
        <StatusPill
          label={
            candidate.actionEligibility.eligible
              ? `${actionLabel} eligible`
              : `${actionLabel} blocked`
          }
          tone={eligibilityTone}
        />
        {selected ? <StatusPill label="Selected" tone="info" /> : null}
        {candidate.requiresBridge ? (
          <StatusPill label="Bridge" tone="warning" />
        ) : (
          <StatusPill label="Direct" tone="success" />
        )}
        {candidate.requiresRemux ? (
          <StatusPill label="Remux" tone="warning" />
        ) : null}
        {!candidate.deviceCompatibility.compatible ? (
          <StatusPill label="Device mismatch" tone="error" />
        ) : null}
      </View>

      {candidate.decisionReasons.length > 0 ? (
        <Text
          style={[styles.reasonLine, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {candidate.decisionReasons.join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

function RejectedRow({ candidate }: { candidate: RejectedCandidate }) {
  const { colors, isDark } = useTheme();
  const actionLabel = formatAction(candidate.actionEligibility.action);

  return (
    <View
      style={[
        styles.rejectedRow,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.035)"
            : "rgba(255,255,255,0.5)",
          borderColor: colors.border,
        },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rejectedTitle, { color: colors.text }]}>
          {candidate.title || candidate.candidateId}
        </Text>
        <Text style={[styles.rejectedReason, { color: colors.textSecondary }]}>
          {candidate.reasonCode}: {candidate.reason}
        </Text>
      </View>
      {candidate.requiresBridge ? (
        <StatusPill label="Bridge" tone="warning" />
      ) : null}
      <StatusPill label={`${actionLabel} blocked`} tone="warning" />
    </View>
  );
}

export function SourceInspectorPanel({
  contentType,
  contentId,
  title,
  season,
  episode,
  initiallySelectedAction = "play",
}: SourceInspectorPanelProps) {
  const { colors, isDark } = useTheme();
  const [action, setAction] = useState<PlaybackAction>(initiallySelectedAction);
  const [plan, setPlan] = useState<PlaybackPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.show);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextPlan = await createPlaybackPlanWithBridgeRetry({
        type: contentType,
        id: contentId,
        season,
        episode,
        action,
      });
      setPlan(nextPlan);
    } catch (err: any) {
      setPlan(null);
      setError(err?.message || "Could not inspect source planning.");
    } finally {
      setLoading(false);
    }
  }, [action, contentId, contentType, episode, season]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const selectedId = plan?.selectedCandidate?.id;
  const orderedCandidates = plan?.orderedCandidates ?? [];
  const rejectedCandidates = plan?.rejectedCandidates ?? [];
  const stateTone = useMemo(() => {
    if (!plan) return "neutral";
    if (plan.state === "ready") return "success";
    if (plan.state === "unsupported" || plan.state === "notFound")
      return "error";
    return "warning";
  }, [plan]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const bundle = createDebugBundle({
        plan,
        context: {
          screen: "detail",
          contentType,
          contentId,
          title,
          season,
          episode,
          action,
        },
      });
      const result = await exportDebugBundle(bundle);
      showToast(
        result.method === "clipboard"
          ? "Debug bundle copied."
          : "Debug bundle exported.",
        "success",
      );
    } catch (err: any) {
      showToast(err?.message || "Could not export debug bundle.", "error");
    } finally {
      setExporting(false);
    }
  }, [action, contentId, contentType, episode, plan, season, showToast, title]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark
            ? "rgba(244,245,247,0.055)"
            : "rgba(16,18,22,0.035)",
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            ADVANCED SOURCE INSPECTOR
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Planner decisions and fallback reasons
          </Text>
        </View>
        {plan ? (
          <StatusPill label={plan.state} tone={stateTone as any} />
        ) : null}
      </View>

      <View style={styles.actionRow}>
        {ACTIONS.map((item) => {
          const active = action === item.action;
          return (
            <Pressable
              key={item.action}
              style={({ pressed, focused }: any) => [
                styles.actionButton,
                {
                  backgroundColor: active
                    ? colors.tint
                    : isDark
                      ? "rgba(244,245,247,0.06)"
                      : "rgba(16,18,22,0.04)",
                  borderColor: active ? colors.tint : colors.border,
                },
                pressed && styles.pressed,
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(colors.focus),
              ]}
              onPress={() => setAction(item.action)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`Inspect ${item.label} sources`}
            >
              <Ionicons
                name={item.icon as any}
                size={16}
                color={active ? colors.onTint : colors.text}
              />
              <Text
                style={[
                  styles.actionText,
                  {
                    color: active ? colors.onTint : colors.text,
                  },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.tint} />
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            Inspecting planner candidates...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={18} color={colors.error} />
          <Text style={[styles.helperText, { color: colors.error }]}>
            {error}
          </Text>
        </View>
      ) : plan ? (
        <>
          <View style={styles.summaryGrid}>
            <StatusPill
              label={`${orderedCandidates.length} ranked`}
              tone="info"
            />
            <StatusPill
              label={`${rejectedCandidates.length} rejected`}
              tone={rejectedCandidates.length > 0 ? "warning" : "success"}
            />
            {plan.requiresBridge ? (
              <StatusPill label="Bridge required" tone="warning" />
            ) : (
              <StatusPill label="No bridge required" tone="success" />
            )}
            {plan.requiresRemux ? (
              <StatusPill label="Remux required" tone="warning" />
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Candidate ranking
            </Text>
            {orderedCandidates.length > 0 ? (
              orderedCandidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  selected={candidate.id === selectedId}
                />
              ))
            ) : (
              <Text
                style={[styles.helperText, { color: colors.textSecondary }]}
              >
                No eligible candidates for this action.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Rejected sources
            </Text>
            {rejectedCandidates.length > 0 ? (
              rejectedCandidates
                .slice(0, 8)
                .map((candidate) => (
                  <RejectedRow
                    key={candidate.candidateId}
                    candidate={candidate}
                  />
                ))
            ) : (
              <Text
                style={[styles.helperText, { color: colors.textSecondary }]}
              >
                No rejected candidates for this action.
              </Text>
            )}
          </View>
        </>
      ) : null}

      <View style={styles.footerActions}>
        <Pressable
          style={({ pressed, focused }: any) => [
            styles.footerButton,
            { borderColor: colors.border },
            pressed && styles.pressed,
            loading && styles.disabled,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
          onPress={loadPlan}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Refresh source inspector"
        >
          <Ionicons name="refresh" size={16} color={colors.textSecondary} />
          <Text style={[styles.footerButtonText, { color: colors.text }]}>
            Refresh
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed, focused }: any) => [
            styles.footerButton,
            { borderColor: colors.border },
            pressed && styles.pressed,
            exporting && styles.disabled,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
          onPress={handleExport}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel="Copy safe debug bundle"
        >
          <Ionicons name="bug-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.footerButtonText, { color: colors.text }]}>
            {exporting ? "Exporting..." : "Copy safe debug bundle"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
  container: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 14,
    marginTop: 16,
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  actionButton: {
    minHeight: uiTouchTarget,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "900",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  helperText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  candidateRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  candidateHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  rankBubble: {
    minWidth: 34,
    minHeight: 30,
    borderRadius: 10,
    backgroundColor: "rgba(108,121,245,0.14)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  rankText: {
    fontSize: 12,
    fontWeight: "900",
  },
  candidateTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  candidateTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  candidateMeta: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 2,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  reasonLine: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  rejectedRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  rejectedTitle: {
    fontSize: 12,
    fontWeight: "900",
  },
  rejectedReason: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 2,
  },
  footerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  footerButton: {
    minHeight: uiTouchTarget,
    borderRadius: uiRadii.control,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  footerButtonText: {
    fontSize: 12,
    fontWeight: "900",
  },
});

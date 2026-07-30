import type { SubtitleCandidate } from "@streamer/shared";
import { normalizeTrackLanguage } from "./trackSelection";

export type SubtitleAccessibilityPreference = "neutral" | "prefer" | "avoid";

export interface SubtitleRankingContext {
  preferredLanguage: string | null;
  selectedAudioLanguage: string | null;
  accessibilityPreference: SubtitleAccessibilityPreference;
  providerOrder: string[];
  explicitSelectionId?: string | null;
}

export interface SubtitleAutoSelectionContext extends SubtitleRankingContext {
  mode: "auto" | "always" | "off";
}

function normalizedIdentity(value?: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function candidateStrength(candidate: SubtitleCandidate) {
  return (
    candidate.confidence * 100 +
    (candidate.fileHashMatch ? 100 : 0) +
    (candidate.fileNameMatch ? 60 : 0) +
    (candidate.contentIdMatch ? 40 : 0)
  );
}

export function deduplicateSubtitleCandidates(candidates: SubtitleCandidate[]) {
  const deduplicated = new Map<string, SubtitleCandidate>();
  for (const candidate of candidates) {
    const language = normalizeTrackLanguage(candidate.language);
    const release = normalizedIdentity(candidate.releaseName);
    const key = release
      ? `${language}:${release}`
      : `${language}:${normalizedIdentity(candidate.providerId)}:${normalizedIdentity(
          candidate.fetchIdentity || candidate.id,
        )}`;
    const existing = deduplicated.get(key);
    if (
      !existing ||
      candidateStrength(candidate) > candidateStrength(existing)
    ) {
      deduplicated.set(key, candidate);
    }
  }
  return [...deduplicated.values()];
}

export function rankSubtitleCandidates(
  candidates: SubtitleCandidate[],
  context: SubtitleRankingContext,
) {
  const preferredLanguage = normalizeTrackLanguage(context.preferredLanguage);
  const audioLanguage = normalizeTrackLanguage(context.selectedAudioLanguage);

  return deduplicateSubtitleCandidates(candidates)
    .map((candidate) => {
      const reasons: string[] = [];
      let score = candidate.confidence * 50;
      const language = normalizeTrackLanguage(candidate.language);

      if (candidate.id === context.explicitSelectionId) {
        score += 10_000;
        reasons.push("explicit");
      }
      if (preferredLanguage !== "unknown" && language === preferredLanguage) {
        score += 120;
        reasons.push("preferred_language");
      }
      if (
        candidate.forced &&
        audioLanguage !== "unknown" &&
        language === audioLanguage
      ) {
        score += 90;
        reasons.push("forced_for_audio");
      }
      if (candidate.fileHashMatch) {
        score += 100;
        reasons.push("file_hash");
      }
      if (candidate.fileNameMatch) {
        score += 70;
        reasons.push("file_name");
      }
      if (candidate.contentIdMatch) {
        score += 50;
        reasons.push("content_id");
      }
      if (candidate.hearingImpaired) {
        if (context.accessibilityPreference === "prefer") score += 25;
        if (context.accessibilityPreference === "avoid") score -= 25;
      }
      const providerIndex = context.providerOrder.indexOf(
        candidate.providerId || "",
      );
      if (providerIndex >= 0) {
        score += Math.max(0, 20 - providerIndex);
        reasons.push("provider_order");
      }

      return { candidate, score, reasons };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.id.localeCompare(right.candidate.id),
    );
}

export function selectAutomaticSubtitle(
  candidates: SubtitleCandidate[],
  context: SubtitleAutoSelectionContext,
) {
  if (context.mode === "off") return null;
  const ranked = rankSubtitleCandidates(candidates, context);
  const best = ranked[0];
  if (!best) return null;

  const preferredLanguage = normalizeTrackLanguage(context.preferredLanguage);
  const audioLanguage = normalizeTrackLanguage(context.selectedAudioLanguage);
  const candidateLanguage = normalizeTrackLanguage(best.candidate.language);
  const strongMatch =
    best.candidate.confidence >= 0.6 ||
    best.candidate.fileHashMatch ||
    best.candidate.fileNameMatch ||
    best.candidate.contentIdMatch;
  if (!strongMatch) return null;

  if (context.mode === "always") {
    return candidateLanguage === preferredLanguage ? best.candidate : null;
  }
  if (
    best.candidate.forced &&
    candidateLanguage === audioLanguage &&
    best.candidate.confidence >= 0.6
  ) {
    return best.candidate;
  }
  if (audioLanguage === preferredLanguage) return null;
  return candidateLanguage === preferredLanguage ? best.candidate : null;
}

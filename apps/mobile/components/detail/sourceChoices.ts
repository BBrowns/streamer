import type { PlaybackPlan } from "@streamer/shared";

export type SourceChoice = {
  candidateId: string;
  quality: { kind: "auto" } | { kind: "label"; value: string };
  sizeBytes?: number;
  language:
    | { kind: "not-listed" }
    | { kind: "multiple" }
    | { kind: "code"; code: string };
} & (
  | { compatibility: "ready" }
  | { compatibility: "local-service" }
  | { compatibility: "conversion" }
);

function sourceQuality(quality?: string): SourceChoice["quality"] {
  if (!quality) return { kind: "auto" };
  return {
    kind: "label",
    value: quality === "2160p" ? "4K" : quality.toUpperCase(),
  };
}

function sourceLanguage(language?: string): SourceChoice["language"] {
  if (!language || language === "unknown") return { kind: "not-listed" };
  if (language === "multi") return { kind: "multiple" };
  return { kind: "code", code: language };
}

export function createSourceChoices(plan: PlaybackPlan): SourceChoice[] {
  return plan.orderedCandidates
    .filter((candidate) => candidate.actionEligibility.eligible)
    .map((candidate) => ({
      candidateId: candidate.id,
      quality: sourceQuality(candidate.quality ?? candidate.stream.resolution),
      sizeBytes: candidate.sizeBytes,
      language: sourceLanguage(candidate.audioLanguage),
      compatibility: candidate.requiresRemux
        ? ("conversion" as const)
        : candidate.requiresBridge
          ? ("local-service" as const)
          : ("ready" as const),
    }));
}

import type { PlannedMediaCandidate } from "@streamer/shared";

/**
 * Planner candidate ids are deliberately fresh per plan. Compare only the
 * runtime source identity when deciding whether a completed discovery gives a
 * failed partial plan something genuinely new to try.
 */
export function getStableCandidateSourceIdentity(
  candidate: PlannedMediaCandidate,
) {
  const stream = candidate.stream;
  if (stream.infoHash) return `infohash:${stream.infoHash.toLowerCase()}`;
  if (stream.url) return `url:${stream.url}`;
  if (stream.externalUrl) return `external:${stream.externalUrl}`;
  return null;
}

export function hasNewStablePlaybackCandidate(
  previous: PlannedMediaCandidate[],
  replacement: PlannedMediaCandidate[],
) {
  const previousSourceIdentities = new Set(
    previous
      .map(getStableCandidateSourceIdentity)
      .filter((identity): identity is string => identity !== null),
  );

  return replacement.some((candidate) => {
    const identity = getStableCandidateSourceIdentity(candidate);
    return identity !== null && !previousSourceIdentities.has(identity);
  });
}

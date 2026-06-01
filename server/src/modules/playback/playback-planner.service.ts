import type {
  BridgeHealthHint,
  MediaCandidate,
  PlaybackPlan,
  PlaybackPlanRequest,
} from "@streamer/shared";
import { aggregatorService } from "../aggregator/aggregator.service.js";
import {
  candidateNeedsRemux,
  candidateNeedsTranscode,
  isDirectlyPlayable,
  normalizeStream,
  scoreCandidate,
} from "./source-normalizer.js";

function episodeAwareId(request: PlaybackPlanRequest) {
  if (
    request.type === "series" &&
    typeof request.season === "number" &&
    typeof request.episode === "number"
  ) {
    return `${request.id}:${request.season}:${request.episode}`;
  }
  return request.id;
}

function bridgeAvailable(bridge?: BridgeHealthHint) {
  return bridge?.status === "available";
}

function bridgeMessage(bridge?: BridgeHealthHint) {
  if (bridge?.status === "unsupported") {
    return "Desktop bridge needs repair before torrent sources can play on this device.";
  }
  if (bridge?.status === "wrong-url") {
    return "The desktop bridge URL is invalid. Check Sources & Devices.";
  }
  return "Start the desktop bridge to play torrent sources on this device.";
}

function titleOf(candidate: MediaCandidate) {
  return (
    candidate.stream.title ||
    candidate.stream.name ||
    candidate.stream.url ||
    candidate.stream.infoHash
  );
}

export class PlaybackPlannerService {
  async createPlan(
    userId: string,
    request: PlaybackPlanRequest,
    requestId: string,
  ): Promise<PlaybackPlan> {
    const contentId = episodeAwareId(request);
    const streams = await aggregatorService.getStreams(
      userId,
      request.type,
      contentId,
      requestId,
    );

    const candidates = streams.map((stream, index) =>
      normalizeStream(stream, index),
    );

    if (candidates.length === 0) {
      return {
        state: "notFound",
        userMessage: "No sources are available for this title yet.",
        debug: { rejectedCandidates: [] },
      };
    }

    const rejected: NonNullable<PlaybackPlan["debug"]>["rejectedCandidates"] =
      [];
    const remuxCandidates: MediaCandidate[] = [];
    const transcodeCandidates: MediaCandidate[] = [];
    const bridgeCandidates: MediaCandidate[] = [];
    const playableCandidates: MediaCandidate[] = [];

    for (const candidate of candidates) {
      if (candidate.kind === "external" || candidate.kind === "unknown") {
        rejected.push({
          candidateId: candidate.id,
          title: titleOf(candidate),
          reason: "Source is not directly playable inside the app.",
        });
        continue;
      }

      if (request.action === "download" && candidate.kind === "hls") {
        rejected.push({
          candidateId: candidate.id,
          title: titleOf(candidate),
          reason: "HLS sources are streaming-only in offline v1.",
        });
        continue;
      }

      if (candidate.kind === "torrent" && !bridgeAvailable(request.bridge)) {
        bridgeCandidates.push(candidate);
        continue;
      }

      if (candidateNeedsTranscode(candidate, request.deviceProfile)) {
        transcodeCandidates.push(candidate);
        continue;
      }

      if (
        candidate.kind === "torrent" &&
        bridgeAvailable(request.bridge) &&
        candidateNeedsRemux(candidate, request.deviceProfile)
      ) {
        remuxCandidates.push(candidate);
        continue;
      }

      if (isDirectlyPlayable(candidate, request.deviceProfile)) {
        playableCandidates.push(candidate);
        continue;
      }

      rejected.push({
        candidateId: candidate.id,
        title: titleOf(candidate),
        reason: "Source is not compatible with this device profile.",
      });
    }

    const sortByScore = (a: MediaCandidate, b: MediaCandidate) =>
      scoreCandidate(
        b,
        request.action,
        request.deviceProfile,
        bridgeAvailable(request.bridge),
      ) -
      scoreCandidate(
        a,
        request.action,
        request.deviceProfile,
        bridgeAvailable(request.bridge),
      );

    const bestPlayable = playableCandidates.sort(sortByScore)[0];
    if (bestPlayable) {
      return {
        state: "ready",
        plan: {
          mode:
            bestPlayable.kind === "torrent"
              ? "bridge"
              : bestPlayable.kind === "hls"
                ? "hls"
                : "direct",
          selectedCandidate: bestPlayable,
          playbackUrl:
            bestPlayable.kind === "direct" || bestPlayable.kind === "hls"
              ? bestPlayable.stream.url
              : undefined,
        },
        debug: { rejectedCandidates: rejected },
      };
    }

    const bestRemux = remuxCandidates.sort(sortByScore)[0];
    if (bestRemux) {
      return {
        state: "ready",
        plan: {
          mode: "remux",
          selectedCandidate: {
            ...bestRemux,
            stream: {
              ...bestRemux.stream,
              behaviorHints: {
                ...bestRemux.stream.behaviorHints,
                remuxToMp4: true,
              },
            },
          },
        },
        userMessage: "Preparing this source for your device.",
        debug: { rejectedCandidates: rejected },
      };
    }

    if (bridgeCandidates.length > 0) {
      return {
        state:
          request.bridge?.status === "unsupported"
            ? "bridgeUnavailable"
            : "needsBridge",
        userMessage: bridgeMessage(request.bridge),
        debug: {
          rejectedCandidates: [
            ...rejected,
            ...bridgeCandidates.map((candidate) => ({
              candidateId: candidate.id,
              title: titleOf(candidate),
              reason: bridgeMessage(request.bridge),
            })),
          ],
        },
      };
    }

    const bestTranscode = transcodeCandidates.sort(sortByScore)[0];
    if (bestTranscode) {
      return {
        state: "needsTranscode",
        plan: {
          mode: "transcode",
          selectedCandidate: bestTranscode,
        },
        userMessage:
          "This source needs video conversion before it can play on this device.",
        debug: { rejectedCandidates: rejected },
      };
    }

    return {
      state: "unsupported",
      userMessage: "No source is compatible with this device yet.",
      debug: { rejectedCandidates: rejected },
    };
  }
}

export const playbackPlannerService = new PlaybackPlannerService();

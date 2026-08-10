import type { PlaybackRoute } from "@streamer/shared";
import { SourcePreparationRegistry } from "./SourcePreparationRegistry";
import {
  SourcePreparationError,
  type LegacySourcePreparationAdapter,
  type LegacySourcePreparationRequest,
  type PreparedSource,
  type RoutedSourcePreparationRequest,
  type SourcePreparationRequest,
} from "./types";

function sameRoute(left: PlaybackRoute, right: PlaybackRoute) {
  const leftCapabilities = left.capabilities;
  const rightCapabilities = right.capabilities;
  return (
    left.candidateId === right.candidateId &&
    left.executionTarget === right.executionTarget &&
    left.delivery === right.delivery &&
    leftCapabilities.seek === rightCapabilities.seek &&
    leftCapabilities.audioTracks === rightCapabilities.audioTracks &&
    leftCapabilities.embeddedSubtitles ===
      rightCapabilities.embeddedSubtitles &&
    leftCapabilities.externalSubtitles ===
      rightCapabilities.externalSubtitles &&
    leftCapabilities.cast === rightCapabilities.cast &&
    leftCapabilities.offline === rightCapabilities.offline &&
    leftCapabilities.thumbnails === rightCapabilities.thumbnails
  );
}

function routeSupportsAction(request: RoutedSourcePreparationRequest) {
  if (request.action === "cast") return request.route.capabilities.cast;
  if (request.action === "download") return request.route.capabilities.offline;
  return true;
}

function assertRoutedRequest(request: RoutedSourcePreparationRequest) {
  if (
    request.candidate.id !== request.route.candidateId ||
    !sameRoute(request.candidate.route, request.route) ||
    request.candidate.actionEligibility.action !== request.action ||
    request.candidate.actionEligibility.eligible !== true ||
    !routeSupportsAction(request)
  ) {
    throw new SourcePreparationError(
      "INVALID_SOURCE",
      "The selected source does not match its planned route.",
      { retryable: false, shouldFallback: false },
    );
  }
}

export class SourcePreparer {
  constructor(
    readonly registry: SourcePreparationRegistry,
    private readonly legacyAdapter?: LegacySourcePreparationAdapter,
  ) {}

  prepare(request: RoutedSourcePreparationRequest): Promise<PreparedSource>;
  prepare(request: LegacySourcePreparationRequest): Promise<PreparedSource>;
  async prepare(request: SourcePreparationRequest): Promise<PreparedSource> {
    if (!request.attemptId.trim() || !request.requestId.trim()) {
      throw new SourcePreparationError(
        "INVALID_SOURCE",
        "Source preparation requires opaque attempt and request identities.",
        { retryable: false, shouldFallback: false },
      );
    }

    if (request.route) {
      assertRoutedRequest(request);
      return await this.registry.resolve(request.route).prepare(request);
    }

    if ("route" in request.candidate) {
      throw new SourcePreparationError(
        "UNSUPPORTED_ROUTE",
        "A planned v3 source requires an explicit executable route.",
        { retryable: false, shouldFallback: false },
      );
    }

    if (!this.legacyAdapter) {
      throw new SourcePreparationError(
        "UNSUPPORTED_ROUTE",
        "Legacy source preparation is unavailable.",
        { retryable: false, shouldFallback: false },
      );
    }
    return await this.legacyAdapter.prepare(request);
  }
}

import { HLSEngine } from "../../streamEngine/HLSEngine";
import type { IStreamEngine } from "../../streamEngine/IStreamEngine";
import {
  PreparedSourceLease,
  SourcePreparationError,
  awaitWithPreparationAbort,
  cancellationError,
  isAbortError,
  throwIfPreparationAborted,
  type RoutedSourcePreparationRequest,
  type SourcePreparationAdapter,
} from "../types";
import { requireHttpMediaUrl } from "./mediaUrl";

export class HlsSourceAdapter implements SourcePreparationAdapter {
  readonly routes = [
    { executionTarget: "on-device", delivery: "hls" },
  ] as const;

  constructor(private readonly engine: IStreamEngine = new HLSEngine()) {}

  async prepare(request: RoutedSourcePreparationRequest) {
    if (
      request.route.executionTarget !== "on-device" ||
      request.route.delivery !== "hls"
    ) {
      throw new SourcePreparationError(
        "UNSUPPORTED_ROUTE",
        "The HLS adapter cannot execute the selected route.",
        { retryable: false, shouldFallback: false },
      );
    }
    if (request.candidate.kind !== "hls") {
      throw new SourcePreparationError(
        "INVALID_SOURCE",
        "The HLS route requires an HLS source.",
      );
    }

    throwIfPreparationAborted(request.signal);
    const expectedUri = requireHttpMediaUrl(request.candidate.stream.url);
    try {
      const resolvedUri = await awaitWithPreparationAbort(
        this.engine.getPlaybackUri(request.candidate.stream),
        request.signal,
      );
      throwIfPreparationAborted(request.signal);
      const uri = requireHttpMediaUrl(resolvedUri);
      if (uri !== expectedUri) {
        throw new SourcePreparationError(
          "INVALID_SOURCE",
          "The HLS adapter returned an unexpected media URL.",
        );
      }
      return new PreparedSourceLease({
        uri,
        stream: request.candidate.stream,
        attemptId: request.attemptId,
        route: request.route,
        runtime: this.engine,
      });
    } catch (error) {
      if (error instanceof SourcePreparationError) throw error;
      if (isAbortError(error, request.signal)) throw cancellationError(error);
      throw new SourcePreparationError(
        "SOURCE_UNAVAILABLE",
        "The HLS source could not be prepared.",
        { cause: error },
      );
    }
  }
}

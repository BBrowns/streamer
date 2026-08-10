import type { Stream } from "@streamer/shared";
import type {
  GatewayJobProgress,
  IStreamEngine,
} from "../../streamEngine/IStreamEngine";
import {
  PreparedSourceLease,
  SourcePreparationError,
  awaitWithPreparationAbort,
  cancellationError,
  isAbortError,
  throwIfPreparationAborted,
  type LegacySourcePreparationAdapter,
  type LegacySourcePreparationRequest,
} from "../types";

export interface LegacyStreamEngineResolver {
  resolveEngine(stream: Stream): IStreamEngine | null;
}

function notifyGatewayProgress(
  callback: ((progress: GatewayJobProgress) => void) | undefined,
  progress: GatewayJobProgress,
) {
  try {
    callback?.(progress);
  } catch {
    // Runtime observers cannot take ownership of source preparation.
  }
}

export class LegacyStreamEngineAdapter implements LegacySourcePreparationAdapter {
  constructor(private readonly resolver: LegacyStreamEngineResolver) {}

  async prepare(request: LegacySourcePreparationRequest) {
    throwIfPreparationAborted(request.signal);
    const engine = this.resolver.resolveEngine(request.candidate.stream);
    if (!engine) {
      throw new SourcePreparationError(
        "SOURCE_UNAVAILABLE",
        "No legacy stream engine can prepare the selected source.",
      );
    }

    let stopped = false;
    const stopOnce = () => {
      if (stopped) return;
      stopped = true;
      try {
        engine.stop?.();
      } catch {
        // Cleanup failure must not replace the playback result.
      }
    };
    const gatewayListener = (progress: GatewayJobProgress) =>
      notifyGatewayProgress(request.onGatewayProgress, progress);
    if (request.onGatewayProgress) {
      engine.on("gateway", gatewayListener);
    }
    const detachGatewayListener = () => {
      if (request.onGatewayProgress) {
        try {
          engine.off("gateway", gatewayListener);
        } catch {
          // Cleanup failure must not replace the playback result.
        }
      }
    };

    try {
      const uri = await awaitWithPreparationAbort(
        engine.getPlaybackUri(request.candidate.stream),
        request.signal,
        stopOnce,
      );
      throwIfPreparationAborted(request.signal);
      if (!uri?.trim()) {
        throw new SourcePreparationError(
          "SOURCE_UNAVAILABLE",
          "The legacy stream engine did not return a playable source.",
        );
      }
      return new PreparedSourceLease({
        uri,
        stream: { ...request.candidate.stream, url: uri },
        attemptId: request.attemptId,
        runtime: engine,
        release: () => {
          detachGatewayListener();
          stopOnce();
        },
      });
    } catch (error) {
      detachGatewayListener();
      stopOnce();
      if (error instanceof SourcePreparationError) throw error;
      if (isAbortError(error, request.signal)) throw cancellationError(error);
      throw new SourcePreparationError(
        "SOURCE_UNAVAILABLE",
        "Legacy source preparation failed.",
        { cause: error },
      );
    }
  }
}

import type {
  PlaybackDelivery,
  PlaybackExecutionTarget,
  PlaybackRoute,
} from "@streamer/shared";
import {
  SourcePreparationError,
  type SourcePreparationAdapter,
  type SourcePreparationRouteBinding,
} from "./types";

function routeKey(
  executionTarget: PlaybackExecutionTarget,
  delivery: PlaybackDelivery,
) {
  return `${executionTarget}:${delivery}`;
}

/** Exact route-to-adapter ownership. It deliberately has no fuzzy fallback. */
export class SourcePreparationRegistry {
  private readonly adapters = new Map<string, SourcePreparationAdapter>();
  private readonly bindings = new Map<string, SourcePreparationRouteBinding>();

  constructor(adapters: Iterable<SourcePreparationAdapter> = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: SourcePreparationAdapter): this {
    if (adapter.routes.length === 0) {
      throw new SourcePreparationError(
        "UNSUPPORTED_ROUTE",
        "A source preparation adapter must own at least one route.",
        { retryable: false, shouldFallback: false },
      );
    }

    const pendingBindings = adapter.routes.map((binding) => ({
      binding,
      key: routeKey(binding.executionTarget, binding.delivery),
    }));
    const pendingKeys = new Set<string>();
    for (const { key } of pendingBindings) {
      if (this.adapters.has(key) || pendingKeys.has(key)) {
        throw new SourcePreparationError(
          "UNSUPPORTED_ROUTE",
          "Multiple source preparation adapters own the same route.",
          { retryable: false, shouldFallback: false },
        );
      }
      pendingKeys.add(key);
    }

    for (const { binding, key } of pendingBindings) {
      this.adapters.set(key, adapter);
      this.bindings.set(key, { ...binding });
    }
    return this;
  }

  resolve(route: PlaybackRoute): SourcePreparationAdapter {
    const adapter = this.adapters.get(
      routeKey(route.executionTarget, route.delivery),
    );
    if (!adapter) {
      throw new SourcePreparationError(
        "UNSUPPORTED_ROUTE",
        "The selected playback route has no source preparation adapter.",
        { retryable: false, shouldFallback: false },
      );
    }
    return adapter;
  }

  has(binding: SourcePreparationRouteBinding) {
    return this.adapters.has(
      routeKey(binding.executionTarget, binding.delivery),
    );
  }

  listRoutes(): SourcePreparationRouteBinding[] {
    return Array.from(this.bindings.values(), (binding) => ({ ...binding }));
  }
}

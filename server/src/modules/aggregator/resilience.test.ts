import { describe, expect, it } from "vitest";
import { ResilienceRegistry } from "./resilience";

describe("ResilienceRegistry retention", () => {
  it("bounds policies, metrics and access state with one shared LRU", () => {
    let now = 1;
    const registry = new ResilienceRegistry({
      maxEntries: 2,
      ttlMs: 60_000,
      now: () => now,
    });

    registry.getPolicy("addon-a");
    now += 1;
    registry.getMetrics("addon-b").retries = 2;
    now += 1;
    registry.getPolicy("addon-c");

    expect(registry.peekMetrics("addon-a")).toBeUndefined();
    expect(registry.getAllMetrics()).toMatchObject({
      "addon-b": { retries: 2 },
      "addon-c": { retries: 0 },
    });
    expect(Object.keys(registry.getAllMetrics())).toHaveLength(2);
  });

  it("expires every part of idle entries after the configured ttl", () => {
    let now = 1_000;
    const registry = new ResilienceRegistry({
      maxEntries: 4,
      ttlMs: 100,
      now: () => now,
    });
    registry.getPolicy("idle-addon");

    now += 101;

    expect(registry.peekMetrics("idle-addon")).toBeUndefined();
    expect(registry.getAllMetrics()).toEqual({});
  });

  it("explicitly removes policy state when an installation is deleted", () => {
    const registry = new ResilienceRegistry({ maxEntries: 4 });
    registry.getPolicy("removed-addon");
    registry.getMetrics("removed-addon").timeouts = 1;

    registry.remove("removed-addon");

    expect(registry.peekMetrics("removed-addon")).toBeUndefined();
    expect(registry.getAllMetrics()).toEqual({});
  });
});

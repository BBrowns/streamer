import type { FeatureFlagName, FeatureFlags } from "@streamer/shared";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

/** Default flag values */
const FLAG_DEFAULTS: Record<FeatureFlagName, boolean> = {
  "torrent-engine": false,
  "real-debrid": false,
  "trakt-sync": false,
  "ai-recommendations": false,
  "continue-watching": true,
  "server-driven-ui": true,
};

/**
 * Simple environment-based feature flag service.
 *
 * Flags are read from environment variables with the pattern:
 * `FF_TORRENT_ENGINE=true` → flag 'torrent-engine' = true
 *
 * In production, this can be swapped for a LaunchDarkly/Unleash adapter
 * that implements the same FeatureFlags interface.
 */
export class FeatureFlagService implements FeatureFlags {
  private readonly flags: Record<FeatureFlagName, boolean>;

  constructor() {
    this.flags = { ...FLAG_DEFAULTS };

    // Override from environment variables
    for (const flag of Object.keys(FLAG_DEFAULTS) as FeatureFlagName[]) {
      const envKey = `FF_${flag.toUpperCase().replace(/-/g, "_")}`;
      const envVal = process.env[envKey];
      if (envVal !== undefined) {
        this.flags[flag] = envVal === "true" || envVal === "1";
      }
    }

    logger.info({ flags: this.flags }, "Feature flags initialized");
  }

  isEnabled(flag: FeatureFlagName): boolean {
    return this.flags[flag] ?? false;
  }

  getAll(): Record<FeatureFlagName, boolean> {
    return { ...this.flags };
  }
}

/** Singleton instance */
export const featureFlags = new FeatureFlagService();

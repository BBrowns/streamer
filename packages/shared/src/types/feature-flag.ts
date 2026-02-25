/** Known feature flag names */
export type FeatureFlagName =
    | 'torrent-engine'
    | 'real-debrid'
    | 'trakt-sync'
    | 'ai-recommendations'
    | 'continue-watching'
    | 'server-driven-ui';

/** Feature flag configuration */
export interface FeatureFlags {
    isEnabled(flag: FeatureFlagName): boolean;
    getAll(): Record<FeatureFlagName, boolean>;
}

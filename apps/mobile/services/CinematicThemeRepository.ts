import type { CinematicPaletteExtractor } from "./CinematicPaletteExtractor";
import {
  deriveCinematicTheme,
  getCinematicThemeSourceUri,
  getFallbackCinematicTheme,
  type CinematicTheme,
  type CinematicThemeSource,
} from "./cinematicTheme";

const STORAGE_KEY = "cinematic-theme-cache";
const ALGORITHM_VERSION = "living-cinema-v2";
const FAILURE_TTL_MS = 24 * 60 * 60 * 1_000;

type StorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type CacheEntry = {
  accessedAt: number;
  dark?: CinematicTheme;
  light?: CinematicTheme;
  failedAt?: number;
};

type PersistedCache = {
  algorithmVersion: string;
  entries: Record<string, CacheEntry>;
};

type RepositoryOptions = {
  extractor: CinematicPaletteExtractor;
  storage: StorageLike;
  hashUri(uri: string): Promise<string>;
  now?: () => number;
  maxEntries?: number;
};

function isTheme(value: unknown): value is CinematicTheme {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return [
    "accent",
    "accentStrong",
    "accentSoft",
    "ambient",
    "ambientMuted",
    "focus",
    "progress",
    "scrimDark",
    "scrimTransparent",
    "glow",
  ].every((key) => typeof record[key] === "string");
}

function parsePersistedCache(value: string | null): Map<string, CacheEntry> {
  if (!value) return new Map();
  try {
    const parsed = JSON.parse(value) as Partial<PersistedCache>;
    if (
      parsed.algorithmVersion !== ALGORITHM_VERSION ||
      !parsed.entries ||
      typeof parsed.entries !== "object"
    ) {
      return new Map();
    }
    const entries = Object.entries(parsed.entries).flatMap(([key, entry]) => {
      if (!entry || typeof entry.accessedAt !== "number") return [];
      const dark = isTheme(entry.dark) ? entry.dark : undefined;
      const light = isTheme(entry.light) ? entry.light : undefined;
      const failedAt =
        typeof entry.failedAt === "number" ? entry.failedAt : undefined;
      if ((!dark || !light) && failedAt === undefined) return [];
      return [
        [key, { accessedAt: entry.accessedAt, dark, light, failedAt }],
      ] as [string, CacheEntry][];
    });
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export class CinematicThemeRepository {
  private readonly extractor: CinematicPaletteExtractor;
  private readonly storage: StorageLike;
  private readonly hashUri: (uri: string) => Promise<string>;
  private readonly now: () => number;
  private readonly maxEntries: number;
  private readonly pending = new Map<string, Promise<CacheEntry>>();
  private entries = new Map<string, CacheEntry>();
  private hydration: Promise<void> | null = null;

  constructor(options: RepositoryOptions) {
    this.extractor = options.extractor;
    this.storage = options.storage;
    this.hashUri = options.hashUri;
    this.now = options.now ?? Date.now;
    this.maxEntries = Math.max(1, options.maxEntries ?? 128);
  }

  async resolve(
    source: CinematicThemeSource,
    isDark: boolean,
    options: { enabled?: boolean } = {},
  ): Promise<CinematicTheme> {
    if (options.enabled === false) return getFallbackCinematicTheme(isDark);
    const uri = getCinematicThemeSourceUri(source);
    if (!uri) return getFallbackCinematicTheme(isDark);

    let uriHash: string;
    try {
      uriHash = await this.hashUri(uri);
    } catch {
      return getFallbackCinematicTheme(isDark);
    }
    const cacheKey = `${ALGORITHM_VERSION}:${source.contentKey}:${uriHash}`;
    await this.hydrate();

    const cached = this.entries.get(cacheKey);
    if (cached?.dark && cached.light) {
      cached.accessedAt = this.now();
      await this.safePersist();
      return isDark ? cached.dark : cached.light;
    }
    if (
      cached?.failedAt !== undefined &&
      this.now() - cached.failedAt < FAILURE_TTL_MS
    ) {
      return getFallbackCinematicTheme(isDark);
    }

    const existing = this.pending.get(cacheKey);
    const work =
      existing ??
      this.extractAndCache(uri, cacheKey).finally(() => {
        this.pending.delete(cacheKey);
      });
    if (!existing) this.pending.set(cacheKey, work);
    const entry = await work;
    if (entry.dark && entry.light) return isDark ? entry.dark : entry.light;
    return getFallbackCinematicTheme(isDark);
  }

  private async hydrate() {
    if (!this.hydration) {
      this.hydration = this.storage
        .getItem(STORAGE_KEY)
        .then((value) => {
          this.entries = parsePersistedCache(value);
          this.trim();
        })
        .catch(() => {
          this.entries = new Map();
        });
    }
    await this.hydration;
  }

  private async extractAndCache(uri: string, cacheKey: string) {
    try {
      const palette = await this.extractor.extract(uri, cacheKey);
      const entry: CacheEntry = {
        accessedAt: this.now(),
        dark: deriveCinematicTheme(palette, true),
        light: deriveCinematicTheme(palette, false),
      };
      this.entries.delete(cacheKey);
      this.entries.set(cacheKey, entry);
      this.trim();
      await this.safePersist();
      return entry;
    } catch {
      const entry: CacheEntry = {
        accessedAt: this.now(),
        failedAt: this.now(),
      };
      this.entries.delete(cacheKey);
      this.entries.set(cacheKey, entry);
      this.trim();
      await this.safePersist();
      return entry;
    }
  }

  private trim() {
    if (this.entries.size <= this.maxEntries) return;
    const sorted = [...this.entries.entries()].sort(
      (left, right) => right[1].accessedAt - left[1].accessedAt,
    );
    this.entries = new Map(sorted.slice(0, this.maxEntries));
  }

  private async safePersist() {
    try {
      const entries = Object.fromEntries(this.entries);
      await this.storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ algorithmVersion: ALGORITHM_VERSION, entries }),
      );
    } catch {
      // Dynamic ambience is opportunistic; storage failure never blocks UI.
    }
  }
}

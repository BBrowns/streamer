import {
  deriveCinematicTheme,
  getFallbackCinematicTheme,
} from "../cinematicTheme";
import { CinematicThemeRepository } from "../CinematicThemeRepository";

function createStorage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    values,
  };
}

const palette = {
  platform: "web" as const,
  dominant: "#7D563B",
  vibrant: "#C6814E",
  darkVibrant: "#5E3422",
  lightVibrant: "#DEA675",
  darkMuted: "#4F3D31",
  lightMuted: "#B99C87",
  muted: "#806B5B",
};

async function waitForMockCall(mock: jest.Mock) {
  for (
    let attempt = 0;
    attempt < 20 && mock.mock.calls.length === 0;
    attempt += 1
  ) {
    await Promise.resolve();
  }
  expect(mock).toHaveBeenCalled();
}

describe("CinematicThemeRepository", () => {
  it("coalesces concurrent extraction and never persists the artwork URL", async () => {
    const storage = createStorage();
    let release: ((value: typeof palette) => void) | undefined;
    const extractor = {
      extract: jest.fn(
        () =>
          new Promise<typeof palette>((resolve) => {
            release = resolve;
          }),
      ),
    };
    const repository = new CinematicThemeRepository({
      extractor,
      storage,
      hashUri: async () => "hashed-uri",
      now: () => 1_000,
    });
    const source = {
      contentKey: "movie:tt0133093" as const,
      backgroundUri: "https://images.example.test/matrix-backdrop.jpg",
    };

    const first = repository.resolve(source, true);
    const second = repository.resolve(source, true);
    await waitForMockCall(extractor.extract);
    release?.(palette);

    expect(await first).toEqual(await second);
    expect(extractor.extract).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalled();
    expect(storage.setItem.mock.calls.at(-1)?.[1]).not.toContain(
      source.backgroundUri,
    );
  });

  it("coalesces extraction without crossing dark and light results", async () => {
    const storage = createStorage();
    let release: ((value: typeof palette) => void) | undefined;
    const extractor = {
      extract: jest.fn(
        () =>
          new Promise<typeof palette>((resolve) => {
            release = resolve;
          }),
      ),
    };
    const repository = new CinematicThemeRepository({
      extractor,
      storage,
      hashUri: async () => "hashed-uri",
      now: () => 1_000,
    });
    const source = {
      contentKey: "movie:tt0133093" as const,
      backgroundUri: "https://images.example.test/matrix-backdrop.jpg",
    };

    const dark = repository.resolve(source, true);
    const light = repository.resolve(source, false);
    await waitForMockCall(extractor.extract);
    release?.(palette);

    expect(await dark).toEqual(deriveCinematicTheme(palette, true));
    expect(await light).toEqual(deriveCinematicTheme(palette, false));
    expect(extractor.extract).toHaveBeenCalledTimes(1);
  });

  it("uses a bounded least-recently-used persistent cache", async () => {
    const storage = createStorage();
    let now = 1_000;
    const repository = new CinematicThemeRepository({
      extractor: { extract: jest.fn().mockResolvedValue(palette) },
      storage,
      hashUri: async (uri) => uri.split("/").at(-1) ?? "missing",
      now: () => now++,
      maxEntries: 2,
    });

    await repository.resolve(
      {
        contentKey: "movie:first",
        backgroundUri: "https://images.example.test/first.jpg",
      },
      true,
    );
    await repository.resolve(
      {
        contentKey: "movie:second",
        backgroundUri: "https://images.example.test/second.jpg",
      },
      true,
    );
    await repository.resolve(
      {
        contentKey: "movie:third",
        backgroundUri: "https://images.example.test/third.jpg",
      },
      true,
    );

    const persisted = JSON.parse(storage.setItem.mock.calls.at(-1)![1]);
    expect(Object.keys(persisted.entries)).toHaveLength(2);
    expect(Object.keys(persisted.entries).join(" ")).not.toContain(
      "movie:first",
    );
  });

  it("caches extraction failures for 24 hours before retrying", async () => {
    const storage = createStorage();
    let now = 10_000;
    const extractor = {
      extract: jest
        .fn()
        .mockRejectedValueOnce(new Error("CORS"))
        .mockResolvedValueOnce(palette),
    };
    const repository = new CinematicThemeRepository({
      extractor,
      storage,
      hashUri: async () => "hashed-uri",
      now: () => now,
    });
    const source = {
      contentKey: "series:tt0903747" as const,
      posterUri: "https://images.example.test/poster.jpg",
    };

    expect(await repository.resolve(source, true)).toEqual(
      getFallbackCinematicTheme(true),
    );
    expect(await repository.resolve(source, true)).toEqual(
      getFallbackCinematicTheme(true),
    );
    expect(extractor.extract).toHaveBeenCalledTimes(1);

    now += 24 * 60 * 60 * 1_000 + 1;
    await repository.resolve(source, true);
    expect(extractor.extract).toHaveBeenCalledTimes(2);
  });

  it("invalidates entries from another algorithm version", async () => {
    const storage = createStorage({
      "cinematic-theme-cache": JSON.stringify({
        algorithmVersion: "legacy",
        entries: {
          stale: {
            accessedAt: 1,
            dark: getFallbackCinematicTheme(true),
            light: getFallbackCinematicTheme(false),
          },
        },
      }),
    });
    const extractor = { extract: jest.fn().mockResolvedValue(palette) };
    const repository = new CinematicThemeRepository({
      extractor,
      storage,
      hashUri: async () => "hashed-uri",
      now: () => 2_000,
    });

    await repository.resolve(
      {
        contentKey: "movie:tt0133093",
        posterUri: "https://images.example.test/poster.jpg",
      },
      false,
    );

    expect(extractor.extract).toHaveBeenCalledTimes(1);
  });

  it("falls back without extraction when disabled or artwork is unavailable", async () => {
    const extractor = { extract: jest.fn().mockResolvedValue(palette) };
    const repository = new CinematicThemeRepository({
      extractor,
      storage: createStorage(),
      hashUri: async () => "hashed-uri",
      now: () => 1_000,
    });

    await repository.resolve(
      {
        contentKey: "movie:tt0133093",
        posterUri: "file:///private/poster.jpg",
      },
      true,
    );
    await repository.resolve(
      {
        contentKey: "movie:tt0133093",
        posterUri: "https://images.example.test/poster.jpg",
      },
      true,
      { enabled: false },
    );

    expect(extractor.extract).not.toHaveBeenCalled();
  });
});

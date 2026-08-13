import { expect, type Page } from "@playwright/test";
import {
  installGoldenPathRoutes,
  type GoldenPathFixtureOptions,
  type GoldenPathScenario,
} from "./fixtures";

export type VisualColorScheme = "dark" | "light";

export const deterministicScreenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const,
  fullPage: true,
  scale: "css" as const,
};

export type FixtureShellOptions = {
  scenario?: GoldenPathScenario;
  colorScheme?: VisualColorScheme;
  settle?: boolean;
  fixture?: GoldenPathFixtureOptions;
  downloads?: "mixed";
  fixedTime?: string;
};

const GOLDEN_PATH_DEVICE_ID = "golden-path-device";
const FIXTURE_READY_DOWNLOAD_URI =
  "streamer:///Users/streamer/offline_media/fixture-ready.m3u8";

type PersistedDownloadTask = {
  id: string;
  mediaInfo: {
    type: "movie" | "series";
    itemId: string;
    title: string;
    poster?: string;
  };
  localUri?: string;
  progress: number;
  status:
    | "Pending"
    | "Preparing"
    | "Downloading"
    | "Verifying"
    | "Completed"
    | "Error"
    | "Paused";
  error?: string;
  downloadedBytes: number;
  metadataBytes: number;
  expectedMediaBytes: number;
  verifiedFileSizeBytes?: number;
  contentType?: string;
  verificationState:
    "pending" | "checking" | "verified" | "incomplete" | "failed";
  playableState: "unknown" | "checking" | "playable" | "unplayable";
  createdAt: string;
  updatedAt: string;
  offlineVerifiedAt?: string;
};

const mixedDownloadTasks: PersistedDownloadTask[] = [
  {
    id: "fixture-download-active",
    mediaInfo: {
      type: "movie",
      itemId: "fixture-download-active-item",
      title: "Fixture in progress",
      poster: "https://assets.example.test/golden-path-poster.svg",
    },
    progress: 0.42,
    status: "Downloading",
    downloadedBytes: 4_200_000,
    metadataBytes: 0,
    expectedMediaBytes: 10_000_000,
    verificationState: "pending",
    playableState: "checking",
    createdAt: "2026-07-18T14:00:00.000Z",
    updatedAt: "2026-07-18T14:20:00.000Z",
  },
  {
    id: "fixture-download-attention",
    mediaInfo: {
      type: "movie",
      itemId: "fixture-download-attention-item",
      title: "Fixture needs attention",
      poster: "https://assets.example.test/golden-path-poster.svg",
    },
    progress: 0.72,
    status: "Error",
    error: "The fixture download was interrupted.",
    downloadedBytes: 7_200_000,
    metadataBytes: 0,
    expectedMediaBytes: 10_000_000,
    verificationState: "failed",
    playableState: "unplayable",
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-18T13:00:00.000Z",
  },
  {
    id: "fixture-download-ready",
    mediaInfo: {
      type: "movie",
      itemId: "fixture-download-ready-item",
      title: "Fixture ready offline",
      poster: "https://assets.example.test/golden-path-poster.svg",
    },
    localUri: FIXTURE_READY_DOWNLOAD_URI,
    progress: 1,
    status: "Completed",
    downloadedBytes: 12_000_000,
    metadataBytes: 0,
    expectedMediaBytes: 12_000_000,
    verifiedFileSizeBytes: 12_000_000,
    contentType: "application/vnd.apple.mpegurl",
    verificationState: "verified",
    playableState: "playable",
    createdAt: "2026-07-16T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
    offlineVerifiedAt: "2026-07-18T12:00:00.000Z",
  },
];

function persistedDownloads(downloads: FixtureShellOptions["downloads"]) {
  if (downloads !== "mixed") return undefined;
  return JSON.stringify({
    state: {
      tasks: Object.fromEntries(
        mixedDownloadTasks.map((task) => [task.id, { ...task }]),
      ),
    },
    version: 6,
  });
}

/**
 * Wait for the frame inputs that can change a screenshot to settle. Keeping
 * this in one place prevents golden-path and visual suites from drifting.
 */
export async function settleVisualFrame(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) =>
        image.decode().catch(() => undefined),
      ),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

export async function loginToFixtureShell(
  page: Page,
  options: FixtureShellOptions = {},
) {
  const controls = await installGoldenPathRoutes(
    page,
    options.scenario ?? "direct",
    options.fixture,
  );
  if (options.fixedTime) await page.clock.setFixedTime(options.fixedTime);
  await page.emulateMedia({
    ...(options.colorScheme ? { colorScheme: options.colorScheme } : {}),
    reducedMotion: "reduce",
  });
  const downloads = persistedDownloads(options.downloads);
  await page.addInitScript(
    ({ deviceId, downloads, readyDownloadUri }) => {
      window.localStorage.setItem("HAS_SEEN_ONBOARDING", "true");
      if (!window.localStorage.getItem("auth-storage")) {
        window.localStorage.setItem(
          "auth-storage",
          JSON.stringify({
            state: {
              user: null,
              deviceId,
              isAuthenticated: false,
              biometricEnabled: false,
              backendUrl: null,
              streamServerUrl: null,
              theme: "system",
              pendingAddonUrls: [],
              lastActiveAt: null,
            },
            version: 0,
          }),
        );
      }
      if (downloads) {
        for (const key of [
          `download-storage-${deviceId}`,
          "download-storage-default",
        ]) {
          if (!window.localStorage.getItem(key)) {
            window.localStorage.setItem(key, downloads);
          }
        }
        // Narrow test-only bridge contract for the persisted managed-file
        // state; this is not browser local-file or media-decode evidence.
        window.desktopBridge = {
          inspectFile: async (localUri: string) => ({
            exists: localUri === readyDownloadUri,
            isFile: localUri === readyDownloadUri,
            sizeBytes: localUri === readyDownloadUri ? 12_000_000 : 0,
          }),
          onDownloadProgress: () => () => undefined,
        } as unknown as NonNullable<typeof window.desktopBridge>;
      }
    },
    {
      deviceId: GOLDEN_PATH_DEVICE_ID,
      downloads,
      readyDownloadUri: FIXTURE_READY_DOWNLOAD_URI,
    },
  );
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("qa@example.test");
  await page.getByPlaceholder("Password").fill("fixture-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("home-screen")).toBeVisible();
  if (options.settle ?? true) {
    await settleVisualFrame(page);
  }
  return controls;
}

export async function expectNoHorizontalPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page, Route } from "@playwright/test";
import {
  playbackPlanRequestSchema,
  playbackPlanSchema,
  type PlaybackAction,
  type PlaybackPlan,
  type PlaybackPlanRequest,
  type PlannedMediaCandidate,
} from "@streamer/shared";

export type GoldenPathScenario =
  | "direct"
  | "torrent-fallback"
  | "no-peers"
  | "preparing-cancellable"
  | "bridge-unavailable"
  | "download-unsupported"
  | "cast-ready"
  | "search-partial"
  | "search-empty"
  | "search-no-provider"
  | "search-unavailable";

export const FIXTURE_MOVIE_ID = "golden-path-movie";
const FIXTURE_SERIES_ID = "golden-path-series";
const API_HOSTS = new Set(["127.0.0.1:3001", "localhost:3001"]);
const BRIDGE_HOSTS = new Set(["127.0.0.1:11470", "localhost:11470"]);
const MEDIA_URL = "https://media.example.test/golden-path.mp4";
const POSTER_URL = "https://assets.example.test/golden-path-poster.svg";
const MEDIA_FIXTURE = resolve(__dirname, "assets/golden-path.mp4");
const GATEWAY_JOB_ID = "00000000-0000-4000-8000-000000000099";

const timeoutBudget = {
  totalMs: 120_000,
  directProbeMs: 8_000,
  hlsProbeMs: 12_000,
  bridgeConnectMs: 5_000,
  torrentMetadataMs: 30_000,
  peerDiscoveryMs: 60_000,
  remuxReadyMs: 60_000,
};

const compatibility = {
  compatible: true,
  containerSupported: true,
  videoCodecSupported: true,
  audioCodecSupported: true,
  qualityWithinProfile: true,
  sourceReachable: true,
};

const moviePreview = {
  id: FIXTURE_MOVIE_ID,
  type: "movie",
  name: "Golden Path Adventure",
  poster: POSTER_URL,
  background: POSTER_URL,
  description: "A deterministic, public-domain test fixture.",
  releaseInfo: "2026",
  imdbRating: "8.8",
};

const seriesPreview = {
  id: FIXTURE_SERIES_ID,
  type: "series",
  name: "Fixture Series",
  poster: POSTER_URL,
  background: POSTER_URL,
  description: "A deterministic series fixture.",
  releaseInfo: "2026",
  imdbRating: "8.4",
};

const searchPreviews = [
  moviePreview,
  seriesPreview,
  {
    ...moviePreview,
    id: "fixture-movie-two",
    name: "Midnight Atlas",
    releaseInfo: "2025",
    imdbRating: "8.1",
  },
  {
    ...moviePreview,
    id: "fixture-movie-three",
    name: "The Quiet Signal",
    releaseInfo: "2024",
    imdbRating: "7.9",
  },
  {
    ...seriesPreview,
    id: "fixture-series-two",
    name: "Northern Lights",
    releaseInfo: "2025",
    imdbRating: "8.2",
  },
  {
    ...moviePreview,
    id: "fixture-movie-four",
    name: "After the Horizon",
    releaseInfo: "2023",
    imdbRating: "7.7",
  },
];

const libraryItems = Array.from({ length: 9 }, (_, index) => ({
  id: `fixture-library-${index + 1}`,
  userId: "fixture-user",
  type: index % 3 === 2 ? ("series" as const) : ("movie" as const),
  itemId: `fixture-library-title-${index + 1}`,
  title: `Library Fixture ${index + 1}`,
  poster: POSTER_URL,
  addedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
}));

const catalogAddon = {
  id: "fixture-addon",
  transportUrl: "https://fixture.example.test/manifest.json",
  installedAt: "2026-01-01T00:00:00.000Z",
  manifest: {
    id: "com.streamer.fixture",
    version: "1.0.0",
    name: "Streamer Selects",
    description: "Deterministic discovery fixtures.",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    catalogs: [
      { type: "movie", id: "featured", name: "Featured films" },
      { type: "series", id: "series", name: "Series to discover" },
    ],
  },
};

function candidate(
  action: PlaybackAction,
  rank: number,
  kind: "direct" | "torrent",
): PlannedMediaCandidate {
  const isTorrent = kind === "torrent";
  return {
    id:
      rank === 0
        ? "00000000-0000-4000-8000-000000000001"
        : "00000000-0000-4000-8000-000000000002",
    kind,
    stream: isTorrent
      ? {
          infoHash: "fixture-no-peers",
          type: "movie",
          id: FIXTURE_MOVIE_ID,
          title: "Fixture torrent source",
          resolution: "1080p",
        }
      : {
          url: MEDIA_URL,
          type: "movie",
          id: FIXTURE_MOVIE_ID,
          title: "Fixture direct source",
          resolution: "1080p",
        },
    quality: "1080p",
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    audioLanguage: "en",
    hdr: "sdr",
    riskFlags: [],
    rank,
    score: 1_000 - rank,
    requiresBridge: isTorrent,
    requiresRemux: false,
    deviceCompatibility: compatibility,
    actionEligibility: { action, eligible: true },
    decisionReasons: ["device_compatible", "quality_within_profile"],
  };
}

function readyPlan(
  action: PlaybackAction,
  scenario: GoldenPathScenario,
): PlaybackPlan {
  const selected = candidate(
    action,
    0,
    scenario === "torrent-fallback" ||
      scenario === "no-peers" ||
      scenario === "preparing-cancellable"
      ? "torrent"
      : "direct",
  );
  const fallbacks =
    scenario === "torrent-fallback" ? [candidate(action, 1, "direct")] : [];
  return playbackPlanSchema.parse({
    version: 2,
    action,
    state: "ready",
    selectedCandidate: selected,
    fallbackCandidates: fallbacks,
    orderedCandidates: [selected, ...fallbacks],
    rejectedCandidates: [],
    decisionReasons: [
      {
        code: "selected_highest_score",
        message: "Selected the deterministic highest-ranked fixture.",
        candidateId: selected.id,
      },
    ],
    actionEligibility: { action, eligible: true },
    timeoutBudget,
    requiresBridge: selected.requiresBridge,
    requiresRemux: selected.requiresRemux,
    deviceCompatibility: compatibility,
    plan: {
      mode: selected.kind === "torrent" ? "bridge" : "direct",
      selectedCandidate: selected,
      fallbackCandidates: fallbacks,
      ...(selected.stream.url ? { playbackUrl: selected.stream.url } : {}),
    },
    debug: { rejectedCandidates: [] },
  });
}

function unavailablePlan(
  action: PlaybackAction,
  scenario: GoldenPathScenario,
): PlaybackPlan {
  const bridgeUnavailable = scenario === "bridge-unavailable";
  return playbackPlanSchema.parse({
    version: 2,
    action,
    state: bridgeUnavailable ? "needsBridge" : "unsupported",
    fallbackCandidates: [],
    orderedCandidates: [],
    rejectedCandidates: [],
    decisionReasons: [],
    actionEligibility: {
      action,
      eligible: false,
      reason: bridgeUnavailable
        ? "torrent_no_bridge"
        : "hls_offline_unsupported",
    },
    timeoutBudget,
    requiresBridge: bridgeUnavailable,
    requiresRemux: false,
    userMessage: bridgeUnavailable
      ? "Start or connect the desktop bridge for this source."
      : "HLS cannot be verified for offline playback yet.",
  });
}

function responsePlan(
  request: PlaybackPlanRequest,
  scenario: GoldenPathScenario,
) {
  const needsTorrentBridge =
    scenario === "torrent-fallback" ||
    scenario === "no-peers" ||
    scenario === "preparing-cancellable";
  if (needsTorrentBridge && request.bridge?.status !== "available") {
    return unavailablePlan(request.action, "bridge-unavailable");
  }

  if (
    scenario === "bridge-unavailable" ||
    (scenario === "download-unsupported" && request.action === "download")
  ) {
    return unavailablePlan(request.action, scenario);
  }
  return readyPlan(request.action, scenario);
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders,
    body: JSON.stringify(body),
  });
}

function posterSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="#c4b5fd"/><circle cx="420" cy="230" r="150" fill="#a7f3d0"/><rect x="65" y="540" width="470" height="210" rx="24" fill="#fff" fill-opacity=".72"/><text x="100" y="635" font-family="sans-serif" font-size="46" font-weight="700" fill="#2c1738">Golden Path</text><text x="100" y="700" font-family="sans-serif" font-size="28" fill="#55435f">Deterministic fixture</text></svg>`;
}

export interface GoldenPathControls {
  plannerRequests: PlaybackPlanRequest[];
  bridgeProbes: () => number;
  gatewayJobsCreated: () => number;
  gatewayJobsCancelled: () => number;
}

export async function installGoldenPathRoutes(
  page: Page,
  scenario: GoldenPathScenario,
): Promise<GoldenPathControls> {
  const plannerRequests: PlaybackPlanRequest[] = [];
  let bridgeProbeCount = 0;
  let gatewayJobs = 0;
  let cancelledGatewayJobs = 0;
  const media = readFileSync(MEDIA_FIXTURE);

  await page.routeWebSocket(/\/api\/sync\/events$/, (socket) => {
    socket.onMessage(() => {});
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.hostname === "assets.example.test") {
      await route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: posterSvg(),
      });
      return;
    }

    if (url.href === MEDIA_URL) {
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        headers: {
          "accept-ranges": "bytes",
          "content-length": String(media.length),
        },
        body: media,
      });
      return;
    }

    if (API_HOSTS.has(url.host)) {
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }

      if (url.pathname === "/api/auth/login") {
        await json(route, {
          user: {
            id: "fixture-user",
            email: "qa@example.test",
            displayName: "QA Viewer",
            createdAt: "2026-01-01T00:00:00.000Z",
            emailVerified: true,
          },
          tokens: {
            accessToken: "fixture-access-token",
            refreshToken: "fixture-refresh-token",
          },
        });
        return;
      }

      if (url.pathname === "/api/catalog/movie") {
        await json(route, {
          metas: [
            moviePreview,
            {
              ...moviePreview,
              id: "fixture-movie-two",
              name: "Second Fixture",
            },
            {
              ...moviePreview,
              id: "fixture-movie-three",
              name: "Third Fixture",
            },
          ],
        });
        return;
      }
      if (url.pathname === "/api/catalog/series") {
        await json(route, { metas: [seriesPreview] });
        return;
      }
      if (url.pathname === "/api/search") {
        const requestedType = url.searchParams.get("type") ?? "all";
        const requestedMode = url.searchParams.get("mode") ?? "results";
        const requestedLimit = Math.max(
          1,
          Math.min(
            Number(url.searchParams.get("limit")) ||
              (requestedMode === "suggestions" ? 6 : 40),
            requestedMode === "suggestions" ? 6 : 100,
          ),
        );
        const hasSearchProvider = scenario !== "search-no-provider";
        const providerUnavailable = scenario === "search-unavailable";
        const shouldReturnResults =
          hasSearchProvider &&
          !providerUnavailable &&
          scenario !== "search-empty";
        const matchingResults = shouldReturnResults
          ? searchPreviews.filter(
              (item) => requestedType === "all" || item.type === requestedType,
            )
          : [];
        const metas = matchingResults.slice(0, requestedLimit);
        const providers = hasSearchProvider
          ? [{ id: catalogAddon.id, name: catalogAddon.manifest.name }]
          : [];
        const failedProviderIds =
          scenario === "search-partial"
            ? ["fixture-unavailable"]
            : providerUnavailable
              ? [catalogAddon.id]
              : [];
        await json(route, {
          metas,
          total: matchingResults.length,
          providers,
          providersByContent: Object.fromEntries(
            metas.map((item) => [`${item.type}:${item.id}`, [catalogAddon.id]]),
          ),
          attemptedProviders: !hasSearchProvider
            ? 0
            : scenario === "search-partial"
              ? 2
              : 1,
          successfulProviders:
            hasSearchProvider && !providerUnavailable ? 1 : 0,
          failedProviderIds,
          partial: scenario === "search-partial",
          truncated: false,
        });
        return;
      }
      if (url.pathname === `/api/meta/movie/${FIXTURE_MOVIE_ID}`) {
        await json(route, {
          meta: {
            ...moviePreview,
            genres: ["Adventure", "Drama"],
            runtime: "1h 30m",
            cast: ["Fixture Performer"],
          },
        });
        return;
      }
      if (url.pathname === `/api/stream/movie/${FIXTURE_MOVIE_ID}`) {
        await json(route, {
          streams: [
            {
              url: MEDIA_URL,
              title: "Fixture direct source",
              resolution: "1080p",
              type: "movie",
              id: FIXTURE_MOVIE_ID,
            },
          ],
        });
        return;
      }
      if (url.pathname === "/api/playback/plan") {
        const parsed = playbackPlanRequestSchema.safeParse(
          request.postDataJSON(),
        );
        if (!parsed.success) {
          await json(
            route,
            {
              error: "Golden-path fixture rejected an invalid planner request.",
            },
            400,
          );
          return;
        }
        plannerRequests.push(parsed.data);
        await json(route, responsePlan(parsed.data, scenario));
        return;
      }
      if (url.pathname.startsWith("/api/stream/resolve/")) {
        await json(route, { resolved: null });
        return;
      }
      if (url.pathname === "/api/addons") {
        await json(route, { addons: [catalogAddon] });
        return;
      }
      if (
        url.pathname.startsWith(`/api/addons/${catalogAddon.id}/catalog/movie/`)
      ) {
        await json(route, {
          metas: searchPreviews.filter((item) => item.type === "movie"),
        });
        return;
      }
      if (
        url.pathname.startsWith(
          `/api/addons/${catalogAddon.id}/catalog/series/`,
        )
      ) {
        await json(route, {
          metas: searchPreviews.filter((item) => item.type === "series"),
        });
        return;
      }
      if (url.pathname === "/api/library/progress") {
        await json(route, { items: [] });
        return;
      }
      if (url.pathname === "/api/library/history") {
        await json(route, { items: [] });
        return;
      }
      if (url.pathname.startsWith("/api/library/progress/")) {
        await json(route, null);
        return;
      }
      if (url.pathname.startsWith("/api/library/check/")) {
        await json(route, { inLibrary: false });
        return;
      }
      if (url.pathname === "/api/library") {
        await json(route, { items: libraryItems });
        return;
      }
      if (url.pathname === "/api/notifications") {
        await json(route, { notifications: [] });
        return;
      }
      if (url.pathname === "/api/sessions") {
        await json(route, { sessions: [] });
        return;
      }
      if (url.pathname === "/api/auth/sessions") {
        await json(route, {
          sessions: [
            {
              id: "fixture-session",
              deviceId: "fixture-browser",
              ipAddress: "127.0.0.1",
              userAgent: "Streamer fixture browser",
              lastActivity: "2026-07-14T18:00:00.000Z",
            },
          ],
        });
        return;
      }
      if (
        url.pathname === "/api/sessions/update" ||
        url.pathname === "/api/sessions/command"
      ) {
        await json(route, { ok: true });
        return;
      }
      if (url.pathname === "/api/trakt/status") {
        await json(route, { connected: false });
        return;
      }
      if (url.pathname === "/api/sync/events") {
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          headers: corsHeaders,
          body: "event: connected\ndata: {}\n\n",
        });
        return;
      }

      await json(
        route,
        { error: `Unhandled fixture endpoint: ${url.pathname}` },
        404,
      );
      return;
    }

    if (BRIDGE_HOSTS.has(url.host)) {
      if (url.pathname === "/api/health" || url.pathname === "/status") {
        bridgeProbeCount += 1;
      }
      if (scenario === "bridge-unavailable") {
        await json(route, { error: "Bridge unavailable in fixture." }, 503);
        return;
      }
      if (url.pathname === "/api/health" || url.pathname === "/status") {
        await json(route, {
          status: "ok",
          owner: "desktop",
          torrentEngine: { available: true },
          runtime: { platform: "darwin", nodeArch: "arm64" },
        });
        return;
      }
      if (url.pathname === "/api/gateway/jobs" && request.method() === "POST") {
        gatewayJobs += 1;
        await json(route, {
          id: GATEWAY_JOB_ID,
          state: "preparing",
          phase: "finding_peers",
          playbackUrl: `/api/gateway/jobs/${GATEWAY_JOB_ID}/stream`,
          progress: null,
          peerCount: 0,
          readyTimeoutMs: 52_000,
        });
        return;
      }
      if (
        url.pathname === `/api/gateway/jobs/${GATEWAY_JOB_ID}` &&
        request.method() === "GET"
      ) {
        if (scenario === "preparing-cancellable") {
          await json(route, {
            id: GATEWAY_JOB_ID,
            state: "preparing",
            phase: "preparing_metadata",
            playbackUrl: `/api/gateway/jobs/${GATEWAY_JOB_ID}/stream`,
            progress: null,
            peerCount: 1,
            readyTimeoutMs: 52_000,
          });
          return;
        }
        await json(route, {
          id: GATEWAY_JOB_ID,
          state: "no_peers",
          phase: "no_peers",
          playbackUrl: null,
          error: "No peers found for this deterministic fixture.",
          progress: null,
          peerCount: 0,
        });
        return;
      }
      if (
        url.pathname === `/api/gateway/jobs/${GATEWAY_JOB_ID}` &&
        request.method() === "DELETE"
      ) {
        cancelledGatewayJobs += 1;
        await json(route, { ok: true });
        return;
      }
      if (url.pathname === "/api/cast/devices") {
        await json(route, {
          devices: [
            {
              id: "fixture-display",
              name: "Fixture Living Room",
              type: "chromecast",
            },
          ],
        });
        return;
      }
      if (url.pathname === "/api/cast/play") {
        await json(route, { ok: true });
        return;
      }
      if (url.pathname === "/stats") {
        await json(route, { peers: 0, speed: 0, progress: 0 });
        return;
      }
      await json(route, { ok: true });
      return;
    }

    await route.continue();
  });

  return {
    plannerRequests,
    bridgeProbes: () => bridgeProbeCount,
    gatewayJobsCreated: () => gatewayJobs,
    gatewayJobsCancelled: () => cancelledGatewayJobs,
  };
}

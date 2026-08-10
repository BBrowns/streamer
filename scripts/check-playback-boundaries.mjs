import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const PLATFORM_NEUTRAL_FILES = new Set([
  "apps/mobile/services/playback/FallbackContinuity.ts",
  "apps/mobile/services/playback/PlayerCapabilityPolicy.ts",
  "apps/mobile/services/playback/PlaybackRuntimeCoordinator.ts",
  "apps/mobile/services/playback/TimelineController.ts",
]);

const PLATFORM_MODULE = /^(?:react(?:-native)?|expo(?:-|$)|electron(?:$|\/))/;
const PRESENTATION_PATH = /(?:^|\/)(?:app|components|hooks)(?:\/|$)/;
const LEGACY_PLANNER_ADAPTER =
  "apps/mobile/services/playback/PlaybackPlanService.ts";
const LEGACY_PLANNER_ENDPOINT = /["'`]\/api\/playback\/plan["'`]/;

export function extractModuleSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\b(?:require|import)\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

function isProductionSource(relativePath) {
  return (
    /\.(?:ts|tsx|js|mjs|cjs)$/.test(relativePath) &&
    !relativePath.includes("/__tests__/") &&
    !/\.(?:test|spec)\.[^.]+$/.test(relativePath)
  );
}

export function checkPlaybackBoundary(relativePath, source) {
  if (!isProductionSource(relativePath)) return [];
  const violations = [];
  if (
    LEGACY_PLANNER_ENDPOINT.test(source) &&
    relativePath !== LEGACY_PLANNER_ADAPTER
  ) {
    violations.push(
      `${relativePath}: legacy planner endpoint must remain inside PlaybackPlanService compatibility adapter`,
    );
  }
  const specifiers = extractModuleSpecifiers(source);
  const isMediaPort =
    relativePath.startsWith("apps/mobile/services/sourcePreparation/") ||
    relativePath.startsWith("apps/mobile/services/bridge/") ||
    PLATFORM_NEUTRAL_FILES.has(relativePath);

  for (const specifier of specifiers) {
    if (
      isMediaPort &&
      (PLATFORM_MODULE.test(specifier) || PRESENTATION_PATH.test(specifier))
    ) {
      violations.push(
        `${relativePath}: media/application boundary imports ${specifier}`,
      );
    }

    if (
      relativePath === "apps/mobile/app/player.tsx" &&
      /(?:sourcePreparation|bridge\/Bridge|streamEngine\/TorrentEngine)/.test(
        specifier,
      )
    ) {
      violations.push(
        `${relativePath}: presentation imports media implementation ${specifier}`,
      );
    }

    if (
      relativePath.startsWith("packages/shared/") &&
      /(?:^|\/)(?:apps|server|stream-server)(?:\/|$)/.test(specifier)
    ) {
      violations.push(
        `${relativePath}: shared contract imports an application/infrastructure package ${specifier}`,
      );
    }

    if (
      relativePath.startsWith("packages/stream-server/src/") &&
      /(?:^|\/)(?:apps\/mobile|server\/src)(?:\/|$)/.test(specifier)
    ) {
      violations.push(
        `${relativePath}: media service imports control-plane application code ${specifier}`,
      );
    }
  }

  return violations;
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(absolute)));
    else files.push(absolute);
  }
  return files;
}

export async function checkRepository(root = REPOSITORY_ROOT) {
  const roots = [
    "apps/mobile/app/player.tsx",
    "apps/mobile/services/bridge",
    "apps/mobile/services/sourcePreparation",
    "apps/mobile/services/playback",
    "packages/shared",
    "packages/stream-server/src",
  ];
  const files = [];
  for (const relativeRoot of roots) {
    const absolute = path.join(root, relativeRoot);
    if (path.extname(absolute)) files.push(absolute);
    else files.push(...(await collectFiles(absolute)));
  }

  const violations = [];
  for (const absolute of new Set(files)) {
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (!isProductionSource(relative)) continue;
    const source = await readFile(absolute, "utf8");
    violations.push(...checkPlaybackBoundary(relative, source));
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = await checkRepository();
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Playback architecture boundaries are valid.");
  }
}

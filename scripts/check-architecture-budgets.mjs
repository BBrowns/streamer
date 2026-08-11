import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const configPath = join(root, "architecture-budgets.json");
const sourceRoot = join(root, "server", "src", "modules");
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

function readConfig() {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (config?.version !== 1 || typeof config.defaultMaxLines !== "number") {
    throw new Error("architecture-budgets.json has an invalid format");
  }
  return config;
}

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(file));
    else if (
      sourceExtensions.has(file.slice(file.lastIndexOf("."))) &&
      !/\.test\.[^.]+$/.test(file) &&
      !file.includes("/__tests__/")
    ) {
      files.push(file);
    }
  }
  return files;
}

function lineCount(file) {
  const source = readFileSync(file, "utf8");
  return source.split(/\r?\n/).length - (source.endsWith("\n") ? 1 : 0);
}

export function evaluateArchitectureBudget({
  files,
  defaultMaxLines,
  exceptions = {},
  now = new Date(),
}) {
  const failures = [];
  const exceptionsUsed = [];
  const filePaths = new Set(files.map((file) => file.relativePath));

  for (const [path, exception] of Object.entries(exceptions)) {
    if (!filePaths.has(path)) {
      failures.push(`${path} has a stale architecture exception.`);
    } else if (
      typeof exception.maxLines !== "number" ||
      typeof exception.reviewBy !== "string"
    ) {
      failures.push(`${path} has an invalid architecture exception budget.`);
    }
  }

  for (const file of files) {
    const lines =
      typeof file.lines === "number" ? file.lines : lineCount(file.path);
    const exception = exceptions[file.relativePath];
    if (!exception && lines > defaultMaxLines) {
      failures.push(
        `${file.relativePath} has ${lines} lines; maximum is ${defaultMaxLines}. Add a bounded decomposition or a reviewed exception.`,
      );
      continue;
    }
    if (!exception) continue;

    const reviewAt = Date.parse(`${exception.reviewBy}T23:59:59.999Z`);
    if (!exception.owner || !exception.reason || !exception.nextAction) {
      failures.push(
        `${file.relativePath} has an incomplete architecture exception.`,
      );
      continue;
    }
    if (!Number.isFinite(reviewAt) || reviewAt < now.getTime()) {
      failures.push(
        `${file.relativePath} has an expired architecture exception.`,
      );
      continue;
    }
    if (lines > exception.maxLines) {
      failures.push(
        `${file.relativePath} has ${lines} lines; exception maximum is ${exception.maxLines}.`,
      );
      continue;
    }
    exceptionsUsed.push({
      path: file.relativePath,
      lines,
      reviewBy: exception.reviewBy,
    });
  }

  return { failures, exceptionsUsed };
}

export function main() {
  const config = readConfig();
  const files = sourceFiles(sourceRoot).map((path) => ({
    path,
    relativePath: relative(root, path),
  }));
  const result = evaluateArchitectureBudget({
    files,
    defaultMaxLines: config.defaultMaxLines,
    exceptions: config.exceptions,
  });

  if (result.failures.length > 0) {
    console.error("Architecture module budgets failed:");
    result.failures.forEach((failure) => console.error(`- ${failure}`));
    return 1;
  }

  console.log(
    `Architecture module budgets passed for ${files.length} production module(s); ` +
      `${result.exceptionsUsed.length} reviewed exception(s) remain.`,
  );
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}

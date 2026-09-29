#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { scopes } from "./gauntlet-evidence.mjs";
import { evaluate, reviewBindings } from "./gauntlet.mjs";
import {
  buildVerificationPlan,
  resolveVisualImpact,
} from "./verify-change.mjs";

const gitBinary = existsSync("/usr/bin/git") ? "/usr/bin/git" : "git";
const executionKinds = new Set([
  "mocked-handler",
  "browser-interaction",
  "native-runtime",
  "external-runtime",
  "command-only",
  "unknown",
]);
const receiptKind = "streamer-verification-receipt";
const fingerprintAlgorithm = "sha256-path-nul-content-nul-v1";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function json(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function within(root, path) {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function local(root, path) {
  if (typeof path !== "string" || !path.trim())
    throw new Error("A local path is required");
  const base = realpathSync(root);
  const target = resolve(base, path);
  if (!within(base, target))
    throw new Error(`Path outside repository: ${path}`);
  let current = base;
  for (const part of relative(base, target).split(sep).filter(Boolean)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error(`Symlink path is not supported: ${path}`);
  }
  return target;
}

function selectedFiles(root, files) {
  if (!Array.isArray(files) || files.length === 0)
    throw new Error("Specify task-owned files");
  return [
    ...new Set(
      files.map((file) => {
        const absolute = local(root, file);
        const name = relative(realpathSync(root), absolute).replaceAll(
          sep,
          "/",
        );
        if (!name || name.startsWith("artifacts/gauntlet/"))
          throw new Error(`Invalid task file: ${file}`);
        return name;
      }),
    ),
  ].sort();
}

function git(root, args) {
  try {
    return execFileSync(gitBinary, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
  } catch {
    return "unknown";
  }
}

function state(root, path) {
  const absolute = local(root, path);
  if (!existsSync(absolute))
    return { path, exists: false, sha256: null, size: null };
  if (!lstatSync(absolute).isFile())
    throw new Error(`Task path is not a regular file: ${path}`);
  const bytes = readFileSync(absolute);
  return { path, exists: true, sha256: sha256(bytes), size: bytes.length };
}

function identity(root, files) {
  const hash = createHash("sha256");
  const states = files.map((file) => {
    const entry = state(root, file);
    hash.update(file).update("\0");
    hash.update(entry.exists ? readFileSync(local(root, file)) : "<missing>");
    hash.update("\0");
    return entry;
  });
  return {
    revision: git(root, ["rev-parse", "HEAD"]),
    fingerprint: hash.digest("hex"),
    fingerprintAlgorithm,
    files: states,
    recordedAt: new Date().toISOString(),
  };
}

function readBaseline(runDirectory) {
  const baseline = readJson(join(runDirectory, "baseline.json"));
  if (baseline.version !== 1 || !Array.isArray(baseline.files))
    throw new Error("Invalid package baseline");
  return baseline;
}

function runPath(root, runDirectory) {
  const absolute = local(root, runDirectory);
  if (!existsSync(join(absolute, "baseline.json")))
    throw new Error("Unknown package run");
  return absolute;
}

function markerPath(runDirectory, attemptId, phase) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(attemptId))
    throw new Error("Invalid check attempt id");
  return join(runDirectory, "check-markers", `${attemptId}.${phase}.json`);
}

export function startPackage({
  root = process.cwd(),
  taskId,
  files,
  task,
  amendments = [],
  visualImpactResolutions = [],
  outputRoot = "artifacts/gauntlet",
}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,59}$/.test(taskId ?? ""))
    throw new Error("Invalid task id");
  const normalized = selectedFiles(root, files);
  const taskRecord = typeof task === "string" ? { request: task } : task;
  if (
    !taskRecord ||
    typeof taskRecord.request !== "string" ||
    !taskRecord.request.trim()
  )
    throw new Error("Task request text is required");
  const verificationMapPath = local(root, "config/verification-map.json");
  const verificationMapBytes = readFileSync(verificationMapPath);
  const initialPlan = buildVerificationPlan(
    normalized,
    JSON.parse(verificationMapBytes.toString("utf8")),
  );
  let verificationPlan;
  try {
    verificationPlan = {
      ...initialPlan,
      ...resolveVisualImpact(initialPlan, visualImpactResolutions),
      verificationMapFingerprint: sha256(verificationMapBytes),
    };
  } catch (error) {
    const files = initialPlan.unknownVisualFiles.join(", ");
    throw new Error(
      `Visual impact classification is unresolved before candidate creation${files ? `: ${files}` : ""} (${error instanceof Error ? error.message : String(error)})`,
      { cause: error },
    );
  }
  const output = local(root, outputRoot);
  const artifactRoot = local(root, "artifacts/gauntlet");
  if (!within(artifactRoot, output))
    throw new Error("Package output must stay under artifacts/gauntlet");
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const runDirectory = join(
    output,
    `${taskId}-${stamp}-${randomUUID().slice(0, 8)}`,
  );
  mkdirSync(output, { recursive: true });
  mkdirSync(runDirectory, { recursive: false });
  const initialIdentity = identity(root, normalized);
  for (const file of normalized) {
    if (existsSync(local(root, file))) {
      const target = join(runDirectory, "baseline-files", file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(local(root, file), target);
    }
  }
  const baseline = {
    version: 1,
    taskId,
    task: taskRecord,
    amendments,
    startedAt: new Date().toISOString(),
    files: normalized,
    verificationPlan,
    visualImpactResolutions: verificationPlan.visualImpactResolutions,
    verificationMapFingerprint: verificationPlan.verificationMapFingerprint,
    identity: initialIdentity,
    worktreeStatus: git(root, ["status", "--short", "--untracked-files=all"]),
    selectedHeadDiff: git(root, [
      "diff",
      "--binary",
      "HEAD",
      "--",
      ...normalized,
    ]),
  };
  json(join(runDirectory, "baseline.json"), baseline);
  return { runDirectory, baseline };
}

function recordCheck({ root = process.cwd(), runDirectory, attemptId, phase }) {
  const directory = runPath(root, runDirectory);
  const baseline = readBaseline(directory);
  const marker = {
    attemptId,
    phase,
    recordedAt: new Date().toISOString(),
    identity: identity(root, baseline.files),
  };
  json(markerPath(directory, attemptId, phase), marker);
  return marker;
}

export function recordCheckStart(options) {
  return recordCheck({ ...options, phase: "start" });
}

export function recordCheckEnd(options) {
  return recordCheck({ ...options, phase: "end" });
}

function utcTime(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(
    value,
  );
  if (!match) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const canonical = `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
  return new Date(parsed).toISOString() === canonical ? parsed : null;
}

function checkMarkers(directory, attemptId, receipt) {
  if (!attemptId)
    return {
      codeChangedDuringControl: "unknown",
      markerBinding: "missing",
      receiptTimeRelation: "unknown",
    };
  const startPath = markerPath(directory, attemptId, "start");
  const endPath = markerPath(directory, attemptId, "end");
  if (!existsSync(startPath) || !existsSync(endPath))
    return {
      codeChangedDuringControl: "unknown",
      markerBinding: "incomplete",
      receiptTimeRelation: "unknown",
    };
  let start;
  let end;
  try {
    start = readJson(startPath);
    end = readJson(endPath);
  } catch {
    return {
      codeChangedDuringControl: "unknown",
      markerBinding: "invalid",
      receiptTimeRelation: "invalid",
    };
  }
  const markerStart = utcTime(start?.recordedAt);
  const markerEnd = utcTime(end?.recordedAt);
  const receiptStart = utcTime(receipt.generatedAt);
  const receiptEnd = utcTime(receipt.finishedAt);
  const metadata = {
    startedAt: start?.recordedAt ?? "unknown",
    finishedAt: end?.recordedAt ?? "unknown",
    startFingerprint: start?.identity?.fingerprint ?? "unknown",
    endFingerprint: end?.identity?.fingerprint ?? "unknown",
    startRevision: start?.identity?.revision ?? "unknown",
    endRevision: end?.identity?.revision ?? "unknown",
  };
  if (
    start?.attemptId !== attemptId ||
    end?.attemptId !== attemptId ||
    start?.phase !== "start" ||
    end?.phase !== "end" ||
    !start?.identity?.fingerprint ||
    !end?.identity?.fingerprint ||
    markerStart === null ||
    markerEnd === null ||
    receiptStart === null ||
    receiptEnd === null ||
    markerStart > markerEnd ||
    receiptStart > receiptEnd
  )
    return {
      ...metadata,
      codeChangedDuringControl: "unknown",
      markerBinding: "invalid",
      receiptTimeRelation: "invalid",
    };
  if (
    receiptEnd < markerStart ||
    receiptStart < markerStart ||
    receiptEnd > markerEnd
  )
    return {
      ...metadata,
      codeChangedDuringControl: "unknown",
      markerBinding: "time-mismatch",
      receiptTimeRelation:
        receiptEnd < markerStart ? "historical" : "outside-markers",
    };
  return {
    codeChangedDuringControl:
      start.identity.fingerprint !== end.identity.fingerprint ||
      start.identity.revision !== end.identity.revision,
    markerBinding: "paired",
    receiptTimeRelation: "within-markers",
    ...metadata,
  };
}

function playwrightRunTimes(stats) {
  const startedAt = Date.parse(stats?.startTime ?? "");
  const duration = stats?.duration;
  if (!Number.isFinite(startedAt) || !Number.isFinite(duration) || duration < 0)
    return null;
  return {
    generatedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(startedAt + duration).toISOString(),
  };
}

function candidateMatchesMarkers(marker, current) {
  if (marker.markerBinding !== "paired") return "unknown";
  if (
    !marker.startFingerprint ||
    !marker.endFingerprint ||
    !marker.startRevision ||
    !marker.endRevision ||
    marker.startFingerprint === "unknown" ||
    marker.endFingerprint === "unknown" ||
    marker.startRevision === "unknown" ||
    marker.endRevision === "unknown" ||
    current.revision === "unknown"
  )
    return "unknown";
  return marker.startFingerprint === current.fingerprint &&
    marker.endFingerprint === current.fingerprint &&
    marker.startRevision === current.revision &&
    marker.endRevision === current.revision &&
    marker.codeChangedDuringControl === false
    ? true
    : false;
}

function nextPackageDirectory(runDirectory) {
  const base = join(runDirectory, "packages");
  mkdirSync(base, { recursive: true });
  const indexes = readdirSync(base)
    .map((name) => /^attempt-(\d+)$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number);
  const index = Math.max(0, ...indexes) + 1;
  const directory = join(base, `attempt-${String(index).padStart(3, "0")}`);
  mkdirSync(directory, { recursive: false });
  return { directory, index };
}

function repairRoundsForCandidate(root, runDirectory, fingerprint) {
  const packagesDirectory = join(runDirectory, "packages");
  if (!existsSync(packagesDirectory)) return [];
  const attempts = readdirSync(packagesDirectory)
    .map((name) => {
      const match = /^attempt-(\d+)$/.exec(name);
      return match ? { name, index: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);

  let repairUsed = false;
  let pendingVisualRepair = null;
  for (const attempt of attempts) {
    const directory = join(packagesDirectory, attempt.name);
    const packagePath = join(directory, "package.json");
    const inputPath = join(directory, "gauntlet-input.json");
    if (!existsSync(packagePath)) continue;
    if (!existsSync(inputPath))
      throw new Error(
        `Cannot verify the repair limit: ${attempt.name} has no Gauntlet input`,
      );

    const input = readJson(inputPath);
    if (!Array.isArray(input.repairRounds))
      throw new Error(
        `Cannot verify the repair limit: ${attempt.name} has no repair-round history`,
      );
    if (input.repairRounds.length > 0) repairUsed = true;

    if (
      pendingVisualRepair &&
      input.candidate?.fingerprint !== pendingVisualRepair.fingerprint
    ) {
      // A later candidate after a completed P1 review consumed the one round,
      // including packages produced before task-wide tracking was added.
      repairUsed = true;
    }

    const reviews = input.reviews ?? (input.review ? [input.review] : []);
    if (!reviews.length) continue;

    let report;
    try {
      report = evaluate(input, { root });
    } catch (error) {
      throw new Error(
        `Cannot verify prior review state in ${attempt.name}: ${error.message}`,
      );
    }
    const hasVisualP1 = reviews.some(
      (review) =>
        review.reviewer?.role === "visual_reviewer" &&
        review.findings?.some((finding) => finding.severity === "P1"),
    );
    if (hasVisualP1 && report.review.state !== "completed")
      throw new Error(
        `Cannot start a repair candidate: ${attempt.name} has an incomplete visual P1 review`,
      );

    const reviewId = report.review.currentReviewIds?.visual_reviewer;
    const findings = report.review.findings.filter(
      (finding) =>
        finding.reviewId === reviewId &&
        finding.reviewerRole === "visual_reviewer" &&
        finding.repairRequired === true &&
        finding.status === "open",
    );
    if (report.review.state === "completed" && reviewId && findings.length) {
      pendingVisualRepair = {
        fingerprint: input.candidate?.fingerprint,
        reviewId,
        retests: [
          ...(input.visualImpact?.cases ?? []),
          ...(input.checkInventory ?? []).map((item) => item.id),
        ],
      };
    }
  }

  if (repairUsed)
    throw new Error(
      "This Gauntlet task already used its one review-driven repair round",
    );
  if (!pendingVisualRepair) return [];
  if (pendingVisualRepair.fingerprint === fingerprint)
    throw new Error(
      "A visual P1 repair requires a changed candidate before packaging",
    );

  return [
    {
      id: "repair-1",
      fromReviewId: pendingVisualRepair.reviewId,
      retests: [...new Set(pendingVisualRepair.retests)].sort(),
    },
  ];
}

function candidateDiff(root, directory, baseline, current) {
  const sections = [];
  const changedFiles = [];
  for (const currentFile of current.files) {
    const before = baseline.identity.files.find(
      (x) => x.path === currentFile.path,
    );
    if (
      before.exists === currentFile.exists &&
      before.sha256 === currentFile.sha256
    )
      continue;
    changedFiles.push(currentFile.path);
    const oldPath = before.exists
      ? join(directory, "..", "..", "baseline-files", currentFile.path)
      : "/dev/null";
    const newPath = currentFile.exists
      ? local(root, currentFile.path)
      : "/dev/null";
    const result = spawnSync(
      gitBinary,
      [
        "diff",
        "--no-index",
        "--no-ext-diff",
        "--binary",
        "--",
        oldPath,
        newPath,
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (![0, 1].includes(result.status))
      throw new Error(
        `Could not diff ${currentFile.path}: ${result.stderr || result.error}`,
      );
    const patch = (result.stdout ?? "")
      .split("\n")
      .map((line) => {
        if (line.startsWith("diff --git "))
          return `diff --git a/${currentFile.path} b/${currentFile.path}`;
        if (line.startsWith("--- "))
          return `--- ${before.exists ? `a/${currentFile.path}` : "/dev/null"}`;
        if (line.startsWith("+++ "))
          return `+++ ${currentFile.exists ? `b/${currentFile.path}` : "/dev/null"}`;
        if (line.startsWith("Binary files "))
          return `Binary files a/${currentFile.path} and b/${currentFile.path} differ`;
        return line;
      })
      .join("\n");
    sections.push(patch);
  }
  const path = join(directory, "candidate.diff");
  writeFileSync(path, sections.join("\n"), { flag: "wx" });
  return { changedFiles, path, sha256: sha256(readFileSync(path)) };
}

function statusFromExit(exitCode) {
  return exitCode === 0
    ? "passed"
    : Number.isInteger(exitCode)
      ? "failed"
      : "unknown";
}

function annotationFor(annotations, id, command) {
  const item = annotations[id] ?? (command ? annotations[command] : null);
  if (!item) return { executionKind: "unknown", labelProvenance: "none" };
  if (!executionKinds.has(item.executionKind))
    throw new Error(`Invalid execution kind for ${id}`);
  if (
    item.executionKind !== "unknown" &&
    (typeof item.source !== "string" || !item.source.trim())
  )
    throw new Error(`Execution kind for ${id} needs an explicit source`);
  if (item.scope !== undefined && !scopes.has(item.scope))
    throw new Error(`Invalid evidence scope for ${id}`);
  if (
    item.scope !== undefined &&
    (typeof item.source !== "string" || !item.source.trim())
  )
    throw new Error(`Evidence scope for ${id} needs an explicit source`);
  return {
    executionKind: item.executionKind,
    scope: item.scope ?? "unknown",
    labelProvenance: "manual",
    executionKindSource: item.source ?? null,
    scopeSource: item.scope === undefined ? null : item.source,
  };
}

function addCheck(rows, id, fields, annotations) {
  if (rows.some((item) => item.id === id))
    throw new Error(`Duplicate check id: ${id}`);
  const annotated = annotationFor(annotations, id, fields.command);
  const label =
    annotated.labelProvenance === "none" &&
    fields.sourceKind === "verify-change"
      ? {
          executionKind: "command-only",
          scope: "command",
          labelProvenance: "runner-format",
          executionKindSource: "verify-change command",
          scopeSource: "verify-change command",
        }
      : annotated;
  const row = {
    id,
    ...fields,
    ...label,
    status: "not-run",
    attempts: [],
    evidence: [],
  };
  rows.push(row);
  return row;
}

function findPlan(root, baseline, planPath) {
  if (planPath) {
    const plan = readJson(local(root, planPath));
    if (
      !Array.isArray(plan.focusedCommands) ||
      !Array.isArray(plan.finalCommands)
    )
      throw new Error("Invalid verification plan");
    if (
      JSON.stringify([...plan.files].sort()) !== JSON.stringify(baseline.files)
    )
      throw new Error(
        "Verification plan file selection differs from task selection",
      );
    return { ...plan, source: "verify-change-plan-output" };
  }
  const mapPath = local(root, "config/verification-map.json");
  const map = readJson(mapPath);
  return {
    ...buildVerificationPlan(baseline.files, map),
    source: "verification-map-derived",
    verificationMapFingerprint: sha256(readFileSync(mapPath)),
  };
}

function safeLabel(value) {
  return String(value ?? "unknown")
    .replace(/(?:magnet:\?|(?:https?|wss?):\/\/)[^\s"']+/gi, "[redacted-url]")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[redacted-ip]");
}

function sourceSummary(kind, data) {
  if (kind === "verify")
    return {
      version: data.version,
      kind: data.kind,
      mode: data.mode,
      generatedAt: data.generatedAt,
      finishedAt: data.finishedAt,
      durationMs: data.durationMs,
      revision: data.revision,
      files: data.files,
      fingerprint: data.fingerprint,
      runtime: data.runtime && {
        node: data.runtime.node,
        npm: data.runtime.npm,
        platform: data.runtime.platform,
      },
      focusedCommands: data.focusedCommands?.map(safeLabel),
      finalCommands: data.finalCommands?.map(safeLabel),
      results: data.results?.map((item) => ({
        command: safeLabel(item.command),
        status: item.status,
        signal: item.signal,
        durationMs: item.durationMs,
      })),
      notRun: data.notRun?.map((item) => ({
        command: safeLabel(item.command),
        reason: safeLabel(item.reason),
        failedCommand: item.failedCommand
          ? safeLabel(item.failedCommand)
          : null,
      })),
    };
  if (kind === "qa")
    return {
      version: data.version,
      runId: safeLabel(data.runId),
      generatedAt: data.generatedAt,
      repository: { revision: data.repository?.revision },
      steps: data.steps?.map((step) => ({
        id: safeLabel(step.id),
        status: step.status,
      })),
    };
  return {
    kind: "playwright-json-summary",
    stats: data.stats && {
      startTime: data.stats.startTime,
      duration: data.stats.duration,
      expected: data.stats.expected,
      unexpected: data.stats.unexpected,
      skipped: data.stats.skipped,
      flaky: data.stats.flaky,
    },
    suites: data.suites?.map((suite) => ({
      title: safeLabel(suite.title),
      specs: suite.specs?.map((spec) => ({
        title: safeLabel(spec.title),
        tests: spec.tests?.map((test) => ({
          projectName: safeLabel(test.projectName),
          status: test.status,
          expectedStatus: test.expectedStatus,
          results: test.results?.map((result) => ({
            status: result.status,
            duration: result.duration,
            startTime: Number.isFinite(Date.parse(result.startTime ?? ""))
              ? new Date(Date.parse(result.startTime)).toISOString()
              : null,
            attachments: result.attachments
              ?.filter(
                (attachment) =>
                  attachment.contentType === "image/png" &&
                  /^gauntlet-visual:[a-z0-9]+(?:-[a-z0-9]+)*:(?:dark|light):\d+x\d+$/.test(
                    attachment.name ?? "",
                  ) &&
                  typeof attachment.path === "string",
              )
              .map(({ name, contentType, path }) => ({
                name,
                contentType,
                path,
              })),
          })),
        })),
      })),
      suites: suite.suites?.map(
        (child) => sourceSummary("playwright", { suites: [child] }).suites[0],
      ),
    })),
  };
}

function importSource(root, directory, supplied, kind, index, missingEvidence) {
  const spec = typeof supplied === "string" ? { path: supplied } : supplied;
  if (!spec || typeof spec.path !== "string")
    throw new Error(`Invalid ${kind} source`);
  let absolute;
  try {
    absolute = local(root, spec.path);
  } catch (error) {
    missingEvidence.push({ source: spec.path, reason: error.message });
    return null;
  }
  if (!existsSync(absolute)) {
    missingEvidence.push({ source: spec.path, reason: "source-unavailable" });
    return null;
  }
  const bytes = readFileSync(absolute);
  if (bytes.length > 2_000_000) {
    missingEvidence.push({ source: spec.path, reason: "source-exceeds-2mb" });
    return null;
  }
  let data;
  try {
    data = sourceSummary(kind, JSON.parse(bytes.toString("utf8")));
  } catch {
    missingEvidence.push({ source: spec.path, reason: "invalid-json" });
    return null;
  }
  const dest = join(
    directory,
    "sources",
    `${kind}-${String(index + 1).padStart(3, "0")}.json`,
  );
  mkdirSync(dirname(dest), { recursive: true });
  const safeBytes = Buffer.from(`${JSON.stringify(data, null, 2)}\n`);
  writeFileSync(dest, safeBytes, { flag: "wx" });
  return {
    ...spec,
    source: relative(root, absolute).replaceAll(sep, "/"),
    copiedPath: relative(root, dest).replaceAll(sep, "/"),
    sha256: sha256(safeBytes),
    rawSha256: sha256(bytes),
    data,
  };
}

function matchesCandidate(root, receipt, current) {
  if (
    !Array.isArray(receipt.files) ||
    !receipt.files.length ||
    !/^[a-f\d]{64}$/i.test(receipt.fingerprint ?? "")
  )
    return "unknown";
  if (
    JSON.stringify(receipt.files) !==
    JSON.stringify(current.files.map((file) => file.path))
  )
    return false;
  try {
    if (
      current.fingerprint !== receipt.fingerprint ||
      identity(root, receipt.files).fingerprint !== receipt.fingerprint
    )
      return false;
    if (
      !receipt.revision ||
      receipt.revision === "unknown" ||
      current.revision === "unknown"
    )
      return "unknown";
    return receipt.revision === current.revision;
  } catch {
    return "unknown";
  }
}

function playwrightTests(suites) {
  const items = [];
  const walk = (suite, parents = []) => {
    const name = [...parents, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? [])
        items.push({ title: [...name, spec.title].join(" › "), spec, test });
    }
    for (const child of suite.suites ?? []) walk(child, name);
  };
  for (const suite of suites ?? []) walk(suite);
  return items;
}

function playwrightStatus(test) {
  if (test.status === "skipped" || test.expectedStatus === "skipped")
    return "skipped";
  if (test.status === "expected" && test.expectedStatus === "passed")
    return "passed";
  if (
    test.status === "unexpected" ||
    test.results?.some(
      (result) => result.status === "failed" || result.status === "timedOut",
    )
  )
    return "failed";
  return "unknown";
}

function snapshotVisualContract(root, directory) {
  const files = ["UI.md", "design/streamer-visual-contract.md"].sort();
  const contractIdentity = identity(root, files);
  const contextDirectory = join(directory, "visual-contract");
  const contextFiles = contractIdentity.files.map((file) => {
    const target = join(contextDirectory, file.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(local(root, file.path), target);
    return {
      path: file.path,
      sha256: file.sha256,
      size: file.size,
      copiedPath: relative(root, target).replaceAll(sep, "/"),
    };
  });
  return {
    algorithm: fingerprintAlgorithm,
    sha256: contractIdentity.fingerprint,
    files: contextFiles,
    contextPath: relative(root, contextDirectory).replaceAll(sep, "/"),
  };
}

function importVisualAttachment({
  root,
  directory,
  attachment,
  candidate,
  attemptId,
  marker,
  caseIds,
  project,
  capturedAt,
  status,
  index,
  runId,
  missingEvidence,
}) {
  const match =
    /^gauntlet-visual:([a-z0-9]+(?:-[a-z0-9]+)*):(dark|light):(\d+)x(\d+)$/.exec(
      attachment.name ?? "",
    );
  if (!match) return null;
  const [, caseId, colorScheme, widthText, heightText] = match;
  if (!caseIds.includes(caseId)) return null;
  if (status !== "passed") {
    missingEvidence.push({
      source: attachment.name,
      reason: "visual-screenshot-test-not-passed",
    });
    return null;
  }
  if (candidateMatchesMarkers(marker, candidate) !== true) {
    missingEvidence.push({
      source: attachment.name,
      reason: "visual-screenshot-candidate-unbound",
      markerBinding: marker.markerBinding,
    });
    return null;
  }
  let bytes;
  try {
    bytes = readFileSync(local(root, attachment.path));
  } catch {
    missingEvidence.push({
      source: attachment.name,
      reason: "visual-screenshot-unavailable-or-outside-repository",
    });
    return null;
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    bytes.length > 2_000_000 ||
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(signature) ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  ) {
    missingEvidence.push({
      source: attachment.name,
      reason: "visual-screenshot-invalid-or-exceeds-2mb",
    });
    return null;
  }
  const viewport = {
    width: Number(widthText),
    height: Number(heightText),
  };
  if (
    !Number.isInteger(viewport.width) ||
    !Number.isInteger(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    missingEvidence.push({
      source: attachment.name,
      reason: "visual-capture-context-invalid",
    });
    return null;
  }
  const relativePath = `sources/visual-${caseId}-${colorScheme}-${viewport.width}x${viewport.height}-${String(index + 1).padStart(2, "0")}.png`;
  const target = join(directory, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes, { flag: "wx" });
  const screenshotHash = sha256(bytes);
  return {
    id: `visual-${caseId}-${colorScheme}-${viewport.width}x${viewport.height}-${String(index + 1).padStart(2, "0")}`,
    runId,
    kind: "visual-screenshot",
    provenance: "recorded",
    path: relative(root, target).replaceAll(sep, "/"),
    screenshotHash,
    candidateIdentity: {
      revision: candidate.revision,
      fingerprint: candidate.fingerprint,
      fingerprintAlgorithm: candidate.fingerprintAlgorithm,
      files: candidate.selectedFiles,
    },
    markerBinding: marker.markerBinding,
    candidateBinding: "current",
    captureContext: {
      caseId,
      project: safeLabel(project),
      viewport,
      colorScheme,
      attemptId,
      ...(typeof capturedAt === "string" && utcTime(capturedAt) !== null
        ? { capturedAt: new Date(utcTime(capturedAt)).toISOString() }
        : {}),
    },
  };
}

export function finishPackage({
  root = process.cwd(),
  runDirectory,
  receipts = [],
  qaRuns = [],
  playwrightReports = [],
  requiredChecks = [],
  amendments = [],
  draft = "",
  annotations = {},
  planPath = null,
  userInterventions = null,
} = {}) {
  const preparationStartedMs = Date.now();
  const run = runPath(root, runDirectory);
  const baseline = readBaseline(run);
  const planned = baseline.verificationPlan ?? findPlan(root, baseline, null);
  const suppliedPlan = planPath ? findPlan(root, baseline, planPath) : planned;
  const plan = {
    ...suppliedPlan,
    visualImpact: planned.visualImpact,
    visualCases: planned.visualCases,
    visualImpactByFile: planned.visualImpactByFile,
    unknownVisualFiles: planned.unknownVisualFiles,
    availableVisualCases: planned.availableVisualCases,
    visualImpactResolutions: planned.visualImpactResolutions ?? [],
    verificationMapFingerprint:
      planned.verificationMapFingerprint ?? baseline.verificationMapFingerprint,
  };
  if (plan.visualImpact === "unknown" || plan.unknownVisualFiles?.length)
    throw new Error(
      "Visual impact classification is unresolved before candidate creation",
    );
  if (plan.visualImpact === "yes" && plan.visualCases.length === 0)
    throw new Error("Visual impact requires at least one stable visual case");
  const current = identity(root, baseline.files);
  const repairRounds = repairRoundsForCandidate(
    root,
    run,
    current.fingerprint,
  );
  const { directory, index } = nextPackageDirectory(run);
  const diff = candidateDiff(root, directory, baseline, current);
  for (const file of current.files.filter((item) => item.exists)) {
    const target = join(directory, "candidate-files", file.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(local(root, file.path), target);
  }
  const candidate = {
    revision: current.revision,
    fingerprint: current.fingerprint,
    fingerprintAlgorithm,
    selectedFiles: baseline.files,
    files: current.files.map((item) => {
      const before = baseline.identity.files.find(
        (entry) => entry.path === item.path,
      );
      return {
        ...item,
        baseline: before,
        state:
          !before.exists && item.exists
            ? "added"
            : before.exists && !item.exists
              ? "deleted"
              : before.sha256 !== item.sha256
                ? "modified"
                : "unchanged",
      };
    }),
    taskBaseline: baseline.identity,
    changedFiles: diff.changedFiles,
    diff: relative(root, diff.path).replaceAll(sep, "/"),
    diffSha256: diff.sha256,
    worktreeStatus: git(root, ["status", "--short", "--untracked-files=all"]),
    selectedHeadDiff: git(root, [
      "diff",
      "--binary",
      "HEAD",
      "--",
      ...baseline.files,
    ]),
    checksMatchCandidate: "unknown",
  };
  const visualContractVersion =
    plan.visualImpact === "yes"
      ? snapshotVisualContract(root, directory)
      : null;
  const rows = [];
  const commands = [
    ...new Set([...plan.focusedCommands, ...plan.finalCommands]),
  ];
  for (const [position, command] of commands.entries())
    addCheck(
      rows,
      `verify-${position + 1}`,
      {
        command,
        text: command,
        sourceKind: "verify-change",
        planStages: [
          plan.focusedCommands.includes(command) ? "focused" : null,
          plan.finalCommands.includes(command) ? "final" : null,
        ].filter(Boolean),
        expectedExecutionKind: null,
      },
      annotations,
    );
  const missingEvidence = [];
  const sources = [];
  const visualEvidence = [];
  const attach = (row, source, attempt) => {
    row.attempts.push(attempt);
    row.status = attempt.status;
    row.evidence.push({
      path: source.copiedPath,
      sha256: source.sha256,
      selector: attempt.selector ?? null,
    });
  };
  receipts.forEach((supplied, index) => {
    const source = importSource(
      root,
      directory,
      supplied,
      "verify",
      index,
      missingEvidence,
    );
    if (!source) return;
    sources.push({
      kind: "verify-change",
      path: source.copiedPath,
      sha256: source.sha256,
      rawSha256: source.rawSha256,
      originalPath: source.source,
    });
    const data = source.data;
    if (
      data.kind !== receiptKind ||
      data.version !== 3 ||
      !["focused", "final"].includes(data.mode) ||
      !Array.isArray(data.results) ||
      !Array.isArray(data.notRun)
    ) {
      missingEvidence.push({
        source: source.source,
        reason: "unsupported-verification-receipt",
      });
      return;
    }
    const marker = checkMarkers(run, source.attemptId, data);
    if (marker.markerBinding !== "paired")
      missingEvidence.push({
        source: source.source,
        reason: "receipt-marker-unbound",
        markerBinding: marker.markerBinding,
        receiptTimeRelation: marker.receiptTimeRelation,
      });
    const candidateMatch = matchesCandidate(root, data, current);
    const common = {
      receipt: source.copiedPath,
      receiptSha256: source.sha256,
      receiptRevision: data.revision ?? "unknown",
      receiptFingerprint: data.fingerprint ?? "unknown",
      receiptFiles: data.files ?? [],
      matchesCandidate: candidateMatch,
      ...marker,
      durationMs: null,
    };
    for (const item of data.results) {
      const row =
        rows.find((entry) => entry.command === item.command) ??
        addCheck(
          rows,
          `verify-extra-${rows.length + 1}`,
          {
            command: item.command,
            text: item.command,
            sourceKind: "verify-change",
            planStages: [],
            expectedExecutionKind: null,
          },
          annotations,
        );
      attach(row, source, {
        ...common,
        selector: item.command,
        status: statusFromExit(item.status),
        exitCode: item.status,
        durationMs: Number.isFinite(item.durationMs) ? item.durationMs : null,
        signal: item.signal ?? null,
      });
    }
    for (const item of data.notRun) {
      const row =
        rows.find((entry) => entry.command === item.command) ??
        addCheck(
          rows,
          `verify-extra-${rows.length + 1}`,
          {
            command: item.command,
            text: item.command,
            sourceKind: "verify-change",
            planStages: [],
            expectedExecutionKind: null,
          },
          annotations,
        );
      attach(row, source, {
        ...common,
        selector: item.command,
        status: "not-run",
        reason: item.reason,
        failedCommand: item.failedCommand ?? null,
      });
    }
  });
  qaRuns.forEach((supplied, index) => {
    const source = importSource(
      root,
      directory,
      supplied,
      "qa",
      index,
      missingEvidence,
    );
    if (!source) return;
    sources.push({
      kind: "qa-run",
      path: source.copiedPath,
      sha256: source.sha256,
      rawSha256: source.rawSha256,
      originalPath: source.source,
    });
    if (source.data.version !== 1 || !Array.isArray(source.data.steps)) {
      missingEvidence.push({
        source: source.source,
        reason: "unsupported-qa-run",
      });
      return;
    }
    for (const step of source.data.steps) {
      const id = `qa-${source.data.runId ?? index + 1}-${step.id}`;
      const row = addCheck(
        rows,
        id,
        {
          command: null,
          text: step.id,
          sourceKind: "qa-run",
          runId: source.data.runId,
          planStages: [],
          expectedExecutionKind: null,
        },
        annotations,
      );
      attach(row, source, {
        selector: step.id,
        status: step.status ?? "unknown",
        receipt: source.copiedPath,
        receiptSha256: source.sha256,
        receiptRevision: source.data.repository?.revision ?? "unknown",
        matchesCandidate:
          source.data.repository?.revision === current.revision
            ? "unknown"
            : false,
        codeChangedDuringControl: "unknown",
        markerBinding: "missing",
        durationMs: null,
      });
    }
  });
  playwrightReports.forEach((supplied, index) => {
    const source = importSource(
      root,
      directory,
      supplied,
      "playwright",
      index,
      missingEvidence,
    );
    if (!source) return;
    sources.push({
      kind: "playwright-json",
      path: source.copiedPath,
      sha256: source.sha256,
      rawSha256: source.rawSha256,
      originalPath: source.source,
    });
    if (!Array.isArray(source.data.suites) || !source.data.stats) {
      missingEvidence.push({
        source: source.source,
        reason: "unsupported-playwright-json",
      });
      return;
    }
    const runTimes = playwrightRunTimes(source.data.stats);
    const marker = runTimes
      ? checkMarkers(run, source.attemptId, runTimes)
      : {
          markerBinding: "invalid",
          codeChangedDuringControl: "unknown",
          receiptTimeRelation: "unknown",
        };
    if (marker.markerBinding !== "paired")
      missingEvidence.push({
        source: source.source,
        reason: "playwright-run-marker-unbound",
        markerBinding: marker.markerBinding,
      });
    const candidateMatch = candidateMatchesMarkers(marker, current);
    for (const [number, item] of playwrightTests(
      source.data.suites,
    ).entries()) {
      const id = `playwright-${index + 1}-${number + 1}`;
      const row = addCheck(
        rows,
        id,
        {
          command: null,
          text: item.title,
          sourceKind: "playwright-json",
          project: item.test.projectName ?? "unknown",
          planStages: [],
          expectedExecutionKind: null,
        },
        annotations,
      );
      attach(row, source, {
        selector: `${item.test.projectName ?? "unknown"}: ${item.title}`,
        status: playwrightStatus(item.test),
        resultStatus: item.test.status ?? "unknown",
        expectedStatus: item.test.expectedStatus ?? "unknown",
        retryStatuses: (item.test.results ?? []).map((result) => result.status),
        receipt: source.copiedPath,
        receiptSha256: source.sha256,
        receiptRevision: marker.startRevision ?? "unknown",
        receiptFingerprint: marker.startFingerprint ?? "unknown",
        receiptFiles: baseline.files,
        matchesCandidate: candidateMatch,
        ...marker,
        durationMs:
          item.test.results?.reduce(
            (total, result) =>
              total + (Number.isFinite(result.duration) ? result.duration : 0),
            0,
          ) ?? null,
      });
      if (plan.visualImpact === "yes") {
        for (const result of item.test.results ?? []) {
          const resultStartedAt = Date.parse(result.startTime ?? "");
          const capturedAt =
            Number.isFinite(resultStartedAt) &&
            Number.isFinite(result.duration) &&
            result.duration >= 0
              ? new Date(resultStartedAt + result.duration).toISOString()
              : undefined;
          for (const [attachmentIndex, attachment] of (
            result.attachments ?? []
          ).entries()) {
            const visual = importVisualAttachment({
              root,
              directory,
              attachment,
              candidate,
              attemptId: source.attemptId,
              marker,
              caseIds: plan.visualCases,
              project: item.test.projectName,
              capturedAt,
              status:
                playwrightStatus(item.test) === "passed" &&
                result.status === "passed"
                  ? "passed"
                  : "failed",
              index: number * 10 + attachmentIndex,
              runId: baseline.taskId,
              missingEvidence,
            });
            if (visual) visualEvidence.push(visual);
          }
        }
      }
    }
  });
  if (plan.visualImpact === "yes") {
    const capturedCases = new Set(
      visualEvidence.map((item) => item.captureContext.caseId),
    );
    for (const caseId of plan.visualCases) {
      if (!capturedCases.has(caseId))
        missingEvidence.push({
          visualCaseId: caseId,
          reason: "required-visual-case-not-captured-for-current-candidate",
        });
    }
  }
  for (const required of requiredChecks) {
    if (!required || typeof required.id !== "string" || !required.id)
      throw new Error("Required check needs an id");
    if (required.scope !== undefined && !scopes.has(required.scope))
      throw new Error(`Invalid required scope: ${required.id}`);
    const row = rows.find(
      (entry) => entry.id === required.id || entry.command === required.command,
    );
    if (row) {
      row.required = true;
      row.expectedExecutionKind = required.expectedExecutionKind ?? null;
      row.requiredScope = required.scope ?? null;
      row.requirementSource = required.source ?? "codex-derived-from-task";
      row.requirementLink = "matched";
    } else {
      if (required.command)
        missingEvidence.push({
          checkId: required.id,
          command: required.command,
          reason: "required-check-unlinked",
        });
      addCheck(
        rows,
        required.id,
        {
          command: required.command ?? null,
          text: required.text ?? required.id,
          sourceKind: "task-required",
          planStages: [],
          required: true,
          expectedExecutionKind: required.expectedExecutionKind ?? null,
          requiredScope: required.scope ?? null,
          requirementSource: required.source ?? "codex-derived-from-task",
          requirementLink: required.command ? "unlinked" : "standalone",
        },
        annotations,
      );
    }
  }
  for (const row of rows) {
    if (row.status === "not-run" && row.evidence.length === 0)
      missingEvidence.push({
        checkId: row.id,
        reason: "no-execution-evidence",
      });
    if (
      row.expectedExecutionKind &&
      !executionKinds.has(row.expectedExecutionKind)
    )
      throw new Error(`Invalid expected execution kind: ${row.id}`);
  }
  const latestAttempts = rows.map((row) => row.attempts.at(-1)).filter(Boolean);
  if (
    latestAttempts.some(
      (attempt) =>
        attempt.matchesCandidate === false ||
        attempt.codeChangedDuringControl === true,
    )
  )
    candidate.checksMatchCandidate = false;
  else if (latestAttempts.length > 0)
    candidate.checksMatchCandidate = latestAttempts.every(
      (attempt) =>
        attempt.matchesCandidate === true &&
        attempt.codeChangedDuringControl === false,
    )
      ? true
      : "unknown";
  const task = {
    ...baseline.task,
    amendments: [...baseline.amendments, ...amendments],
    labelProvenance: "user-request-and-codex-transcription",
  };
  const generatedAt = new Date().toISOString();
  const gauntletEvidence = rows
    .map((row) => {
      const attempt = row.attempts.at(-1);
      const currentVerifyReceipt =
        row.sourceKind === "verify-change" &&
        attempt?.receipt &&
        attempt?.selector &&
        attempt.markerBinding === "paired" &&
        attempt.matchesCandidate === true &&
        attempt.codeChangedDuringControl === false;
      const kind = currentVerifyReceipt
        ? "verify-change"
        : row.sourceKind === "qa-run" && attempt?.receipt
          ? "qa-run"
          : "observation";
      return {
        id: row.id,
        runId: row.runId ?? baseline.taskId,
        kind,
        ...(kind === "observation"
          ? {
              scope: row.scope ?? "unknown",
              status:
                row.sourceKind === "verify-change" && row.status === "passed"
                  ? "unknown"
                  : row.status,
              source: attempt?.receipt ?? "package/checkInventory",
              observedAt: generatedAt,
              revision: "unknown",
              fingerprint: "unknown",
            }
          : { path: attempt.receipt, selector: attempt.selector }),
        provenance:
          attempt?.receiptTimeRelation === "historical" ||
          attempt?.matchesCandidate === false
            ? "historical"
            : "recorded",
        candidateBinding: currentVerifyReceipt ? "current" : "unbound",
        receiptTimeRelation: attempt?.receiptTimeRelation ?? "unknown",
        executionKind: row.executionKind,
        executionKindSource: row.executionKindSource ?? null,
        labelProvenance: row.labelProvenance,
      };
    })
    .concat(visualEvidence);
  const requirements = task.requirements?.length
    ? task.requirements
    : rows
        .filter((row) => row.required)
        .map((row) => ({
          id: row.id,
          text: row.text,
          runId: row.runId ?? baseline.taskId,
          scope:
            row.requiredScope ??
            (row.sourceKind === "verify-change"
              ? "command"
              : row.sourceKind === "qa-run"
                ? "manual"
                : "unknown"),
          expectedExecutionKind: row.expectedExecutionKind ?? undefined,
          evidence: [row.id],
        }));
  const runIds = [...new Set(rows.map((row) => row.runId).filter(Boolean))];
  const gauntletInput = {
    version: 1,
    task: {
      outcome: task.outcome ?? task.request,
      request: task.request,
      amendments: task.amendments,
      requirements,
    },
    runs: [
      {
        id: baseline.taskId,
        target: "task-selected candidate",
        runtime: "local",
        documents: [],
      },
      ...runIds
        .filter((id) => id !== baseline.taskId)
        .map((id) => ({
          id,
          target: "QA run",
          runtime: "local",
          documents: [],
        })),
    ],
    evidence: gauntletEvidence,
    visualImpact: {
      status: plan.visualImpact,
      cases: plan.visualCases,
      resolutions: plan.visualImpactResolutions ?? [],
    },
    visualReview:
      plan.visualImpact === "yes"
        ? {
            contractVersion: visualContractVersion,
          }
        : null,
    conclusions: [],
    candidate,
    checkInventory: rows,
    draft,
    reviews: [],
    repairRounds,
  };
  const finishedMs = Date.now();
  const metrics = {
    preparation: {
      startedAt: baseline.startedAt,
      packageStartedAt: new Date(preparationStartedMs).toISOString(),
      finishedAt: new Date(finishedMs).toISOString(),
      packageDurationMs: finishedMs - preparationStartedMs,
      // The interval since the task snapshot also includes implementation,
      // review, and repair; it is not a measured preparation duration.
      durationMs: null,
      usage: null,
    },
    review: {
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      usage: null,
    },
    repair: {
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      usage: null,
    },
    manualUserInterventions: {
      events: userInterventions ?? [],
      count: userInterventions === null ? null : userInterventions.length,
      completeness: userInterventions === null ? "unknown" : "codex-recorded",
    },
  };
  const pkg = {
    version: 1,
    kind: "gauntlet-review-package",
    taskId: baseline.taskId,
    attempt: index,
    generatedAt,
    task,
    candidate,
    verificationPlan: plan,
    visualContractVersion,
    checkInventory: rows,
    evidenceSources: sources,
    missingEvidence,
    draft,
    gauntletInput,
    metrics,
  };
  const bindings = reviewBindings(gauntletInput, { root });
  const phase1Bindings = {
    version: 1,
    recordedAt: new Date().toISOString(),
    candidateFingerprint: candidate.fingerprint,
    bindings: {
      task: bindings.task,
      candidate: bindings.candidate,
      evidence: bindings.evidence,
      checkInventory: bindings.checkInventory,
      ...(plan.visualImpact === "yes"
        ? {
            visualContract: bindings.visualContract,
            visualCases: bindings.visualCases,
          }
        : {}),
    },
    source: "package-generated-before-review",
  };
  const packagePath = join(directory, "package.json");
  json(packagePath, pkg);
  json(join(directory, "gauntlet-input.json"), gauntletInput);
  json(join(directory, "phase1-bindings.json"), phase1Bindings);
  return {
    packagePath,
    gauntletInputPath: join(directory, "gauntlet-input.json"),
    package: pkg,
  };
}

export function parseCli(argv) {
  const [command, ...parts] = argv;
  const values = new Map();
  for (let i = 0; i < parts.length; i += 1) {
    const key = parts[i];
    if (!key.startsWith("--")) throw new Error(`Unknown argument: ${key}`);
    const value = parts[++i];
    if (!value || value.startsWith("--"))
      throw new Error(`${key} requires a value`);
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const one = (key) => values.get(key)?.at(-1);
  const many = (key) => values.get(key) ?? [];
  const textFile = (path) => {
    const bytes = readFileSync(local(process.cwd(), path));
    if (bytes.length > 2_000_000)
      throw new Error("Text input exceeds 2 MB limit");
    return bytes.toString("utf8");
  };
  if (command === "start") {
    const task =
      one("--task-text") ??
      (one("--task-file") ? textFile(one("--task-file")) : null);
    return {
      command,
      options: {
        taskId: one("--task-id"),
        files: many("--file"),
        task,
        amendments: many("--amendment-file").map(textFile),
        visualImpactResolutions: many("--visual-impact").map((value) => {
          const parts = value.split("|");
          const [file, impact] = parts;
          if (
            !file ||
            !["yes", "no"].includes(impact) ||
            (impact === "no" && ![2, 4].includes(parts.length)) ||
            (impact === "yes" && ![3, 5].includes(parts.length))
          )
            throw new Error(
              "--visual-impact expects path|no|resolved-by|rationale or path|yes|case-id,case-id|resolved-by|rationale",
            );
          const hasResolutionMetadata =
            parts.length === (impact === "no" ? 4 : 5);
          const caseList = impact === "yes" ? parts[2] : "";
          const resolvedBy = hasResolutionMetadata
            ? parts[impact === "no" ? 2 : 3]
            : undefined;
          const rationale = hasResolutionMetadata
            ? parts
                .slice(impact === "no" ? 3 : 4)
                .join("|")
                .trim()
            : "";
          return {
            file,
            impact,
            cases: caseList ? caseList.split(",").filter(Boolean) : [],
            resolvedBy,
            rationale,
          };
        }),
        outputRoot: one("--output-root") ?? "artifacts/gauntlet",
      },
    };
  }
  if (command === "check-start" || command === "check-end")
    return {
      command,
      options: { runDirectory: one("--run"), attemptId: one("--attempt-id") },
    };
  if (command === "finish") {
    const annotations = {};
    for (const value of many("--annotation")) {
      const parts = value.split("|");
      if (![3, 4].includes(parts.length) || parts.some((part) => !part.trim()))
        throw new Error(
          "--annotation expects id|execution-kind|source or id|execution-kind|scope|source",
        );
      const [id, executionKind] = parts;
      const [scope, source] =
        parts.length === 4 ? [parts[2], parts[3]] : [undefined, parts[2]];
      annotations[id] = { executionKind, scope, source };
    }
    const receiptPaths = many("--receipt");
    const attemptIds = many("--receipt-attempt-id");
    if (attemptIds.length > 0 && attemptIds.length !== receiptPaths.length)
      throw new Error(
        "Provide one --receipt-attempt-id for every --receipt, in matching order",
      );
    const playwrightPaths = many("--playwright");
    const playwrightAttemptIds = many("--playwright-attempt-id");
    if (
      playwrightAttemptIds.length > 0 &&
      playwrightAttemptIds.length !== playwrightPaths.length
    )
      throw new Error(
        "Provide one --playwright-attempt-id for every --playwright, in matching order",
      );
    return {
      command,
      options: {
        runDirectory: one("--run"),
        receipts: receiptPaths.map((path, index) =>
          attemptIds.length > 0 ? { path, attemptId: attemptIds[index] } : path,
        ),
        qaRuns: many("--qa"),
        playwrightReports: playwrightPaths.map((path, index) =>
          playwrightAttemptIds.length > 0
            ? { path, attemptId: playwrightAttemptIds[index] }
            : path,
        ),
        planPath: one("--plan"),
        requiredChecks: many("--required-check").map((text, i) => ({
          id: `required-${i + 1}`,
          text: text.trim(),
          command: text.trim(),
          scope: "command",
          expectedExecutionKind: "command-only",
          source: "codex-derived-from-task",
        })),
        amendments: many("--amendment-file").map(textFile),
        draft: one("--draft-file") ? textFile(one("--draft-file")) : "",
        annotations,
      },
    };
  }
  throw new Error(
    "Usage: gauntlet-package.mjs start|check-start|check-end|finish [options]",
  );
}

export function main(argv = process.argv.slice(2)) {
  const { command, options } = parseCli(argv);
  const result =
    command === "start"
      ? startPackage(options)
      : command === "check-start"
        ? recordCheckStart(options)
        : command === "check-end"
          ? recordCheckEnd(options)
          : finishPackage(options);
  console.log(
    JSON.stringify(
      command === "start"
        ? { runDirectory: result.runDirectory }
        : command === "finish"
          ? {
              packagePath: result.packagePath,
              gauntletInputPath: result.gauntletInputPath,
            }
          : result,
    ),
  );
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

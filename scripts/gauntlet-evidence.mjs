import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export const statuses = new Set([
  "passed",
  "failed",
  "skipped",
  "not-run",
  "blocked",
  "planned",
  "unknown",
]);
export const scopes = new Set([
  "command",
  "preflight",
  "manual",
  "unit",
  "local-fixture",
  "external-network",
  "live-provider",
  "real-device",
  "active-probe",
  "context-observation",
  "unknown",
]);
export const executionKinds = new Set([
  "mocked-handler",
  "browser-interaction",
  "native-runtime",
  "external-runtime",
  "command-only",
  "unknown",
]);
export const known = (value) =>
  typeof value === "string" && value.trim() !== "" && value !== "unknown";
export const timestamp = (value) =>
  known(value) && Number.isFinite(Date.parse(value));
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const fileSelection = (files) =>
  Array.isArray(files) &&
  files.length > 0 &&
  files.every(known) &&
  new Set(files).size === files.length;
export const verificationFingerprintAlgorithm =
  "sha256-path-nul-content-nul-v1";
export const comparableFingerprints = (a, b) =>
  known(a.fingerprint) &&
  known(b.fingerprint) &&
  known(a.fingerprintAlgorithm) &&
  a.fingerprintAlgorithm === b.fingerprintAlgorithm &&
  fileSelection(a.files) &&
  fileSelection(b.files) &&
  JSON.stringify(a.files) === JSON.stringify(b.files);

// All inputs are local, read-only, explicitly supplied. Do not follow paths out
// of the repository or execute commands mentioned in receipts.
export function localPath(root, path) {
  if (!known(path)) throw new Error("missing local path");
  const base = realpathSync(root);
  const absolute = resolve(base, path);
  const within = (candidate) => {
    const rel = relative(base, candidate);
    return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
  };
  if (!within(absolute) || !within(realpathSync(absolute))) {
    throw new Error("path outside repository");
  }
  return absolute;
}

function readBytes(root, path) {
  const bytes = readFileSync(localPath(root, path));
  if (bytes.length > 2_000_000) throw new Error("input exceeds 2 MB limit");
  return bytes;
}

export const readLocal = (root, path) => readBytes(root, path).toString("utf8");

function counts(value) {
  if (
    !value ||
    !["passed", "failed", "skipped"].every(
      (key) => Number.isSafeInteger(value[key]) && value[key] >= 0,
    )
  )
    return null;
  return { passed: value.passed, failed: value.failed, skipped: value.skipped };
}

export function loadEvidence(item, root) {
  const result = {
    id: item.id,
    runId: item.runId,
    kind: item.kind,
    provenance: item.provenance ?? "unknown",
    status: "unknown",
    scope: "unknown",
    counts: null,
    scenarios: {},
    revision: "unknown",
    fingerprint: "unknown",
    source: "unknown",
    observedAt: "unknown",
    exitCode: null,
    executionKind: "unknown",
    executionKindSource: "unknown",
    labelProvenance: "unknown",
    finishedAt: "unknown",
    durationMs: null,
    receiptDurationMs: null,
    notRunReason: "unknown",
    runtime: null,
    issues: [],
  };
  if (item.kind === "observation") {
    Object.assign(result, {
      status: statuses.has(item.status) ? item.status : "unknown",
      scope: scopes.has(item.scope) ? item.scope : "unknown",
      source: known(item.source) ? item.source : "unknown",
      observedAt: timestamp(item.observedAt) ? item.observedAt : "unknown",
      revision: known(item.revision) ? item.revision : "unknown",
      fingerprint: known(item.fingerprint) ? item.fingerprint : "unknown",
      fingerprintAlgorithm: known(item.fingerprintAlgorithm)
        ? item.fingerprintAlgorithm
        : "unknown",
      files: fileSelection(item.files) ? [...item.files] : [],
      exitCode: Number.isInteger(item.exitCode) ? item.exitCode : null,
      counts: counts(item.counts),
      scenarios: item.scenarios ?? {},
      executionKind: executionKinds.has(item.executionKind)
        ? item.executionKind
        : "unknown",
      executionKindSource: known(item.executionKindSource)
        ? item.executionKindSource
        : "unknown",
      labelProvenance: ["manual", "agent-derived"].includes(
        item.labelProvenance,
      )
        ? item.labelProvenance
        : "unknown",
      finishedAt: timestamp(item.finishedAt) ? item.finishedAt : "unknown",
      durationMs:
        Number.isSafeInteger(item.durationMs) && item.durationMs >= 0
          ? item.durationMs
          : null,
    });
    if (
      !record(result.scenarios) ||
      Object.entries(result.scenarios).some(
        ([name, status]) => !known(name) || !statuses.has(status),
      )
    )
      result.issues.push("SCENARIOS_INVALID");
    if (
      result.status === "passed" &&
      record(result.scenarios) &&
      Object.values(result.scenarios).some(
        (status) => status === "failed" || status === "blocked",
      )
    ) {
      // Flag the contradiction without rewriting the reported observation.
      result.issues.push("OBSERVATION_CONTRADICTION");
    }
    if (item.counts && !result.counts) result.issues.push("COUNTS_UNKNOWN");
    if (
      result.counts?.failed > 0 ||
      (result.exitCode !== null && result.exitCode !== 0)
    ) {
      result.status = "failed";
    } else if (
      result.status === "passed" &&
      result.counts &&
      result.counts.passed === 0
    ) {
      result.status = result.counts.skipped > 0 ? "skipped" : "unknown";
    }
  } else {
    if (!known(item.selector)) {
      result.issues.push("SELECTOR_INVALID");
      return result;
    }
    let data;
    try {
      data = JSON.parse(readLocal(root, item.path));
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error("invalid receipt");
      result.source = item.path;
    } catch {
      result.issues.push("RECEIPT_UNAVAILABLE");
      return result;
    }
    if (
      item.kind === "qa-run" &&
      data.version === 1 &&
      Array.isArray(data.steps)
    ) {
      result.observedAt = timestamp(data.generatedAt)
        ? data.generatedAt
        : "unknown";
      result.revision = data.repository?.revision ?? "unknown";
      result.receiptRunId = data.runId;
      if (
        !known(data.runId) ||
        data.steps.some(
          (step) =>
            !record(step) || !known(step.id) || !statuses.has(step.status),
        )
      ) {
        result.issues.push("RECEIPT_INVALID");
        return result;
      }
      if (data.runId !== item.runId) result.issues.push("RUN_MISMATCH");
      const matches = data.steps.filter((step) => step.id === item.selector);
      if (matches.length !== 1) result.issues.push("SELECTION_UNKNOWN");
      const step = matches.length === 1 ? matches[0] : null;
      result.status = statuses.has(step?.status) ? step.status : "unknown";
      result.scope =
        item.selector === "runtime-preflight" ? "preflight" : "manual";
      result.labelProvenance = "receipt";
      result.executionKind =
        item.selector === "runtime-preflight" ? "command-only" : "unknown";
      result.notRunReason = known(step?.reason) ? step.reason : "unknown";
    } else if (item.kind === "verify-change") {
      // --plan output intentionally has no execution results or receipt kind.
      if (Array.isArray(data.focusedCommands) && !data.results && !data.kind) {
        if (!Array.isArray(data.finalCommands ?? [])) {
          result.issues.push("RECEIPT_INVALID");
          return result;
        }
        const commands = [
          ...data.focusedCommands,
          ...(data.finalCommands ?? []),
        ];
        if (commands.every(known) && commands.includes(item.selector))
          result.status = "planned";
        else result.issues.push("SELECTION_UNKNOWN");
        result.scope = "command";
        result.labelProvenance = "receipt";
        result.executionKind = "command-only";
      } else if (
        data.kind === "streamer-verification-receipt" &&
        data.version === 3 &&
        ["focused", "final"].includes(data.mode) &&
        Array.isArray(data.results)
      ) {
        result.revision = data.revision ?? "unknown";
        result.fingerprint =
          typeof data.fingerprint === "string" &&
          /^[a-f\d]{64}$/i.test(data.fingerprint)
            ? data.fingerprint
            : "unknown";
        result.observedAt = timestamp(data.generatedAt)
          ? data.generatedAt
          : "unknown";
        result.finishedAt = timestamp(data.finishedAt)
          ? data.finishedAt
          : "unknown";
        result.receiptDurationMs =
          Number.isSafeInteger(data.durationMs) && data.durationMs >= 0
            ? data.durationMs
            : null;
        result.runtime = record(data.runtime) ? { ...data.runtime } : null;
        result.scope = "command";
        result.labelProvenance = "receipt";
        result.executionKind = "command-only";
        const notRun = data.notRun ?? [];
        if (
          data.results.some(
            (entry) =>
              !record(entry) ||
              !known(entry.command) ||
              !Number.isInteger(entry.status) ||
              entry.status < 0,
          ) ||
          !Array.isArray(notRun) ||
          notRun.some(
            (entry) =>
              !record(entry) || !known(entry.command) || !known(entry.reason),
          )
        ) {
          result.issues.push("RECEIPT_INVALID");
          return result;
        }
        const matches = data.results.filter(
          (entry) => entry.command === item.selector,
        );
        const skipped = notRun.filter(
          (entry) => entry.command === item.selector,
        );
        if (matches.length + skipped.length !== 1) {
          result.issues.push("SELECTION_UNKNOWN");
          return result;
        }
        const command = matches[0];
        result.durationMs =
          Number.isSafeInteger(command?.durationMs) && command.durationMs >= 0
            ? command.durationMs
            : null;
        result.notRunReason = known(skipped[0]?.reason)
          ? skipped[0].reason
          : "unknown";
        result.exitCode = Number.isInteger(command?.status)
          ? command.status
          : null;
        result.status =
          result.exitCode === 0
            ? "passed"
            : result.exitCode !== null
              ? "failed"
              : skipped.length === 1
                ? "not-run"
                : "unknown";
        result.files = fileSelection(data.files) ? [...data.files] : [];
        result.fingerprintAlgorithm = verificationFingerprintAlgorithm;
        result.currentFingerprint = "unknown";
        try {
          if (!fileSelection(data.files) || !known(result.fingerprint))
            throw new Error("no files");
          const hash = createHash("sha256");
          for (const file of data.files) {
            hash
              .update(file)
              .update("\0")
              .update(readBytes(root, file))
              .update("\0");
          }
          result.currentFingerprint =
            hash.digest("hex") === data.fingerprint ? "match" : "mismatch";
        } catch {
          /* Missing files remain unknown, not a failed historical run. */
        }
      } else result.issues.push("RECEIPT_UNSUPPORTED");
    } else result.issues.push("RECEIPT_UNSUPPORTED");
    if (
      executionKinds.has(item.executionKind) &&
      item.executionKind !== "unknown" &&
      ["manual", "agent-derived"].includes(item.labelProvenance) &&
      known(item.executionKindSource)
    ) {
      result.executionKind = item.executionKind;
      result.executionKindSource = item.executionKindSource;
      result.labelProvenance = item.labelProvenance;
    }
  }
  if (
    (result.scope === "local-fixture" &&
      result.executionKind === "mocked-handler") ||
    (result.scope === "real-device" &&
      !["native-runtime", "unknown"].includes(result.executionKind)) ||
    (["external-network", "live-provider", "active-probe"].includes(
      result.scope,
    ) &&
      ["mocked-handler", "browser-interaction", "command-only"].includes(
        result.executionKind,
      ))
  )
    result.issues.push("EXECUTION_KIND_CONTRADICTION");
  if (
    !known(result.source) ||
    !timestamp(result.observedAt) ||
    !["historical", "reconstructed", "synthetic", "recorded"].includes(
      result.provenance,
    )
  ) {
    result.issues.push("PROVENANCE_UNKNOWN");
  }
  return result;
}

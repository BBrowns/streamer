#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  known,
  comparableFingerprints,
  executionKinds,
  loadEvidence,
  localPath,
  readLocal,
  scopes,
  statuses,
  timestamp,
} from "./gauntlet-evidence.mjs";

const networks = new Set(["home", "work", "guest", "hotspot", "unknown"]);
const oldWords = {
  home: /\b(home|thuis\w*)\b/i,
  work: /\b(work|werk\w*)\b/i,
  guest: /\b(guest|gast\w*)\b/i,
  hotspot: /\bhotspot\b/i,
};
const issueDetails = {
  OBSERVATION_CONTRADICTION:
    "Geregistreerde passed-status botst met een failed/blocked scenario; oorspronkelijke waarneming behouden.",
  SELECTOR_INVALID:
    "Een niet-lege selector is vereist; ontbrekende waarden zijn geen bewijsselectie.",
  RECEIPT_INVALID:
    "Relevante receiptvelden ontbreken of zijn ongeldig; geen geldige uitvoeringsselectie.",
  SELECTION_UNKNOWN:
    "Geen eenduidige selectie in dit bewijsstuk; uitvoering onbekend.",
  CODE_CONFLICT:
    "Geselecteerd bewijs bevat verschillende bekende revisies of tegenstrijdige vergelijkbare fingerprints; geen gezamenlijke kandidaatonderbouwing.",
  FINGERPRINT_INCOMPARABLE:
    "Fingerprint-eis niet te beoordelen: algoritme en geordende bestandsselectie moeten bekend en gelijk zijn.",
};

function validate(input) {
  if (input.version !== 1) throw new Error("Expected pilot input version 1");
  for (const [name, items] of Object.entries({
    runs: input.runs,
    evidence: input.evidence,
    conclusions: input.conclusions,
    corrections: input.corrections,
    requirements: input.task?.requirements,
    reviews: input.reviews,
    repairRounds: input.repairRounds,
  })) {
    if (
      items !== undefined &&
      (!Array.isArray(items) || items.some((item) => !item || !known(item.id)))
    ) {
      throw new Error(`${name} must be an array of records with ids`);
    }
    if (
      new Set((items ?? []).map(({ id }) => id)).size !== (items ?? []).length
    ) {
      throw new Error(`Duplicate id in ${name}`);
    }
  }
  if (input.repairRounds?.length > 1)
    throw new Error("At most one review-driven repair round is allowed");
  if (input.review && input.reviews)
    throw new Error("Use review or reviews, not both");
}

function contextFor(run, corrections) {
  const original = run.context;
  let context = {
    runId: run.id,
    category: "unknown",
    source: "unknown",
    confirmedAt: "unknown",
  };
  if (
    original?.runId === run.id &&
    networks.has(original.category) &&
    known(original.source) &&
    timestamp(original.confirmedAt)
  ) {
    context = { ...original };
  }
  for (const correction of corrections
    .filter(({ runId }) => runId === run.id)
    .sort((a, b) => Date.parse(a.confirmedAt) - Date.parse(b.confirmedAt))) {
    if (
      networks.has(correction.to) &&
      known(correction.source) &&
      timestamp(correction.confirmedAt)
    ) {
      context = {
        runId: run.id,
        category: correction.to,
        source: correction.source,
        confirmedAt: correction.confirmedAt,
        correctionId: correction.id,
      };
    } else
      context = {
        runId: run.id,
        category: "unknown",
        source: "unknown",
        confirmedAt: "unknown",
      };
  }
  return {
    ...context,
    target: run.target ?? "unknown",
    runtime: run.runtime ?? "unknown",
    originalContext: original ?? null,
  };
}

function assess(claim, evidence, contexts, expectedStatus = "passed") {
  const reasons = new Set();
  const selected = (claim.evidence ?? []).map((id) =>
    evidence.find((item) => item.id === id),
  );
  if (!selected.length || selected.some((item) => !item))
    reasons.add("EVIDENCE_MISSING");
  if (!contexts.some(({ runId }) => runId === claim.runId))
    reasons.add("RUN_UNKNOWN");
  if (!scopes.has(claim.scope) || claim.scope === "unknown")
    reasons.add("SCOPE_UNKNOWN");
  if (
    claim.expectedExecutionKind !== undefined &&
    (!executionKinds.has(claim.expectedExecutionKind) ||
      claim.expectedExecutionKind === "unknown")
  )
    reasons.add("EXECUTION_KIND_UNKNOWN");
  const items = selected.filter(Boolean);
  if (new Set(items.map(({ revision }) => revision).filter(known)).size > 1)
    reasons.add("CODE_CONFLICT");
  for (let index = 0; index < items.length; index += 1) {
    for (const other of items.slice(index + 1)) {
      if (
        comparableFingerprints(items[index], other) &&
        items[index].fingerprint !== other.fingerprint
      )
        reasons.add("CODE_CONFLICT");
    }
  }
  for (const item of selected.filter(Boolean)) {
    if (item.runId !== claim.runId) reasons.add("RUN_MISMATCH");
    if (
      !statuses.has(expectedStatus) ||
      expectedStatus === "unknown" ||
      item.status !== expectedStatus
    ) {
      reasons.add(
        expectedStatus === "passed" ? "NOT_PASSED" : "STATUS_MISMATCH",
      );
    }
    if (item.scope !== claim.scope) reasons.add("SCOPE_MISMATCH");
    if (claim.expectedExecutionKind) {
      if (item.executionKind === "unknown")
        reasons.add("EXECUTION_KIND_UNKNOWN");
      else if (item.executionKind !== claim.expectedExecutionKind)
        reasons.add("EXECUTION_KIND_MISMATCH");
    }
    item.issues.forEach((issue) => reasons.add(issue));
    if (
      expectedStatus === "passed" &&
      item.counts?.skipped > 0 &&
      !claim.scenarios?.length
    )
      reasons.add("SCENARIOS_NOT_PASSED");
    if (claim.code?.revision && claim.code.revision !== item.revision)
      reasons.add("CODE_MISMATCH");
    if (claim.code?.fingerprint) {
      if (!comparableFingerprints(claim.code, item))
        reasons.add("FINGERPRINT_INCOMPARABLE");
      else if (claim.code.fingerprint !== item.fingerprint)
        reasons.add("CODE_MISMATCH");
    }
    if (claim.code?.currentFiles && item.currentFingerprint !== "match")
      reasons.add("CODE_NOT_CURRENT");
  }
  for (const scenario of claim.scenarios ?? []) {
    const states = selected
      .filter(Boolean)
      .map((item) => item.scenarios?.[scenario])
      .filter(Boolean);
    if (!states.length) reasons.add("SCENARIOS_UNKNOWN");
    else if (!states.every((status) => status === expectedStatus))
      reasons.add("SCENARIOS_NOT_PASSED");
  }
  if (claim.network && claim.network !== "unknown") {
    const context = contexts.find(({ runId }) => runId === claim.runId);
    if (
      !networks.has(claim.network) ||
      !context ||
      context.category === "unknown"
    )
      reasons.add("NETWORK_CONFIRMATION_NEEDED");
    else if (context.category !== claim.network)
      reasons.add("NETWORK_MISMATCH");
  }
  return [...reasons];
}

function documentsIn(root, directories, findings) {
  const files = new Set();
  let visited = 0;
  function walk(directory) {
    if (++visited > 2000) throw new Error("scan limit");
    for (const entry of readdirSync(localPath(root, directory), {
      withFileTypes: true,
    })) {
      if (entry.isSymbolicLink()) continue;
      const path = relative(root, resolve(root, directory, entry.name));
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && path.endsWith(".md")) {
        if (++visited > 2000) throw new Error("scan limit");
        files.add(path);
      }
    }
  }
  for (const directory of directories) {
    try {
      walk(directory);
    } catch {
      findings.push({
        code: "DOCUMENT_SCAN_INCOMPLETE",
        subject: directory,
        detail:
          "Scan ontbreekt of is begrensd; inhoudelijke beoordeling nodig.",
      });
    }
  }
  return files;
}

function correctionReview(input, root, findings) {
  const affected = [];
  if (input.corrections?.length && !input.documentRoots?.length) {
    findings.push({
      code: "DOCUMENT_SCAN_INCOMPLETE",
      subject: "documentRoots",
      detail:
        "Geen zoekmappen voor inkomende verwijzingen opgegeven; dekking onbekend.",
    });
  }
  const candidates = documentsIn(root, input.documentRoots ?? [], findings);
  for (const correction of input.corrections ?? []) {
    const run = (input.runs ?? []).find(({ id }) => id === correction.runId);
    if (!run) {
      findings.push({
        code: "RUN_UNKNOWN",
        subject: correction.id,
        detail: "Correctie heeft geen bekende run.",
      });
      continue;
    }
    const add = (item) =>
      affected.push({ runId: run.id, correctionId: correction.id, ...item });
    for (const [kind, items] of [
      ["conclusion", input.conclusions],
      ["requirement", input.task?.requirements],
    ]) {
      for (const item of items ?? [])
        if (item.runId === run.id) add({ kind, id: item.id });
    }
    const targets = new Set(
      (run.documents ?? []).map((path) => resolve(root, path)),
    );
    for (const path of run.documents ?? []) {
      add({ kind: "document", path });
      candidates.add(path);
      if (oldWords[correction.from]?.test(path))
        findings.push({
          code: "STALE_LABEL",
          subject: path,
          detail:
            "Oude netwerkterm in bestandsnaam; tekstherkenning, inhoudelijke beoordeling nodig.",
        });
    }
    if (!targets.size)
      findings.push({
        code: "DOCUMENT_COVERAGE_UNKNOWN",
        subject: correction.id,
        detail:
          "Geen documenten aan deze run gekoppeld; inhoudelijke beoordeling nodig.",
      });
    for (const path of candidates) {
      let contents;
      try {
        contents = readLocal(root, path);
      } catch {
        findings.push({
          code: "DOCUMENT_UNAVAILABLE",
          subject: path,
          detail: "Document niet leesbaar; onbekend.",
        });
        continue;
      }
      const target = targets.has(resolve(root, path));
      contents.split(/\r?\n/).forEach((line, index) => {
        // Only ordinary inline Markdown links. Never interpret prose as facts.
        const links = [...line.matchAll(/\[[^\]]*\]\(<?([^)>]+)>?\)/g)];
        const incoming = links.some((match) => {
          const href = match[1].split("#")[0];
          return (
            !/^[a-z]+:/i.test(href) &&
            targets.has(resolve(root, dirname(path), href))
          );
        });
        if (incoming && !target)
          add({ kind: "reference", path, line: index + 1 });
        if ((target || incoming) && oldWords[correction.from]?.test(line))
          findings.push({
            code: "STALE_LABEL",
            subject: `${path}:${index + 1}`,
            detail:
              "Oude netwerkterm bij betrokken document/verwijzing; kan ook een geldige ontkenning zijn. Inhoudelijke beoordeling nodig.",
          });
      });
    }
    findings.push({
      code: "CORRECTION_REVIEW",
      subject: correction.id,
      detail:
        "Herbeoordeel gekoppelde claims, documenten en directe verwijzingen. Waarnemingen blijven behouden.",
    });
  }
  return affected;
}

function evaluateBase(input, { root = process.cwd() } = {}) {
  validate(input);
  const findings = [];
  const evidence = (input.evidence ?? []).map((item) =>
    loadEvidence(item, root),
  );
  const contexts = (input.runs ?? []).map((run) =>
    contextFor(run, input.corrections ?? []),
  );
  for (const item of evidence) {
    if (item.issues.includes("OBSERVATION_CONTRADICTION"))
      findings.push({
        code: "OBSERVATION_CONTRADICTION",
        subject: item.id,
        detail: issueDetails.OBSERVATION_CONTRADICTION,
      });
    if (!known(item.revision) || !known(item.fingerprint))
      findings.push({
        code: "CODE_UNKNOWN",
        subject: item.id,
        detail:
          "Code-identiteit gedeeltelijk of geheel onbekend; geen bewijs voor de huidige volledige werkboom.",
      });
    if (item.currentFingerprint === "mismatch")
      findings.push({
        code: "CODE_CHANGED",
        subject: item.id,
        detail:
          "Geselecteerde bestanden wijken nu af; historische uitvoeringsstatus blijft behouden.",
      });
  }
  const assessAll = (items, openState) =>
    (items ?? []).map((item) => {
      const reasons = assess(
        item,
        evidence,
        contexts,
        openState === "review" ? (item.expectedStatus ?? "passed") : "passed",
      );
      for (const reason of reasons)
        findings.push({
          code: reason,
          subject: item.id,
          detail:
            issueDetails[reason] ??
            "Eis/conclusie niet onderbouwd binnen de opgegeven bewijsgrens.",
        });
      return {
        ...item,
        state: reasons.length ? openState : "supported",
        reasons,
      };
    });
  const requirements = assessAll(input.task?.requirements, "open");
  const conclusions = assessAll(input.conclusions, "review");
  const affected = correctionReview(input, root, findings);
  for (const item of affected) {
    const collection =
      item.kind === "requirement"
        ? requirements
        : item.kind === "conclusion"
          ? conclusions
          : [];
    const claim = collection.find(({ id }) => id === item.id);
    if (claim && !claim.reasons.includes("CORRECTION_REVIEW")) {
      claim.reasons.push("CORRECTION_REVIEW");
      claim.state = item.kind === "requirement" ? "open" : "review";
    }
  }
  if (!known(input.task?.outcome) || !requirements.length)
    findings.push({
      code: "TASK_UNKNOWN",
      subject: "task",
      detail:
        "Uitkomst of vereiste controles ontbreken; volledigheid onbekend.",
    });
  return {
    version: 1,
    outcome: input.task?.outcome ?? "unknown",
    requirements,
    evidence,
    conclusions,
    contexts,
    corrections: input.corrections ?? [],
    affected,
    findings,
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value ?? null;
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function bindingsFor(input, base) {
  return {
    task: digest(input.task ?? null),
    candidate: digest(input.candidate ?? null),
    evidence: digest(base.evidence),
    checkInventory: digest(input.checkInventory ?? null),
    draft: digest({
      draft: input.draft ?? null,
      conclusions: input.conclusions ?? [],
    }),
    gauntlet: digest(base),
  };
}

// The review recorder can call this before either phase. The evidence binding
// includes loaded receipt values, not just paths and hand-written labels.
export function reviewBindings(input, options = {}) {
  return bindingsFor(input, evaluateBase(input, options));
}

function reviewState(review, bindings, input) {
  const phase1 = review.phase1;
  const phase2 = review.phase2;
  const reviewer = review.reviewer;
  if (
    !reviewer?.independent ||
    reviewer.context !== "fresh" ||
    reviewer.role !== "risk_reviewer" ||
    !timestamp(phase1?.recordedAt) ||
    !timestamp(phase2?.recordedAt) ||
    Date.parse(phase1.recordedAt) >= Date.parse(phase2.recordedAt) ||
    !known(phase1.assessment) ||
    !known(phase2.comparison) ||
    !input.candidate ||
    !Array.isArray(input.checkInventory) ||
    !known(input.draft) ||
    !input.task?.requirements?.length ||
    !input.evidence?.length ||
    !Array.isArray(review.findings)
  )
    return "incomplete";
  // Phase 1 has no draft or Gauntlet binding: those are first shared in phase 2.
  if (
    phase1.bindings?.draft !== undefined ||
    phase1.bindings?.gauntlet !== undefined
  )
    return "incomplete";
  const phase1Keys = ["task", "candidate", "evidence", "checkInventory"];
  const phase2Keys = ["draft", "gauntlet"];
  if (
    phase1Keys.some((key) => !known(phase1.bindings?.[key])) ||
    phase2Keys.some((key) => !known(phase2.bindings?.[key]))
  )
    return "incomplete";
  return phase1Keys.every((key) => phase1.bindings[key] === bindings[key]) &&
    phase2Keys.every((key) => phase2.bindings[key] === bindings[key])
    ? "current"
    : "stale";
}

function summarizeReview(input, bindings) {
  const reviews = input.reviews ?? (input.review ? [input.review] : []);
  const reviewHistory = reviews.map((item) => ({
    ...item,
    state: reviewState(item, bindings, input),
  }));
  const latest = reviewHistory.at(-1);
  const current = latest?.state === "current" ? latest : null;
  const dispositionIndex = new Map(
    (current?.dispositions ?? [])
      .filter(
        (item) =>
          known(item.reviewId) &&
          known(item.findingId) &&
          ["resolved", "open", "accepted-risk", "not-verified"].includes(
            item.status,
          ) &&
          known(item.source),
      )
      .map((item) => [`${item.reviewId}/${item.findingId}`, item]),
  );
  const findings = reviews.flatMap((review) =>
    (Array.isArray(review.findings) ? review.findings : [])
      .filter((finding) => known(finding.id))
      .map((finding) => {
        const disposition = dispositionIndex.get(`${review.id}/${finding.id}`);
        return {
          ...finding,
          reviewId: review.id,
          status: disposition?.status ?? "open",
          dispositionSource: disposition?.source ?? "unknown",
        };
      }),
  );
  return {
    review: {
      state: !latest
        ? "not-run"
        : latest.state === "current"
          ? "completed"
          : latest.state,
      currentReviewId: current?.id ?? null,
      reviewerRole: current?.reviewer?.role ?? "unknown",
      findings,
      openFindingCount: findings.filter((item) => item.status !== "resolved")
        .length,
      repairRoundCount: input.repairRounds?.length ?? 0,
    },
    reviewHistory,
  };
}

export function evaluate(input, options = {}) {
  const base = evaluateBase(input, options);
  const bindings = bindingsFor(input, base);
  const { review, reviewHistory } = summarizeReview(input, bindings);
  const findings = [...base.findings];
  if (review.state !== "completed")
    findings.push({
      code: "SEMANTIC_REVIEW",
      subject: "task",
      detail:
        "Afzonderlijke inhoudelijke review ontbreekt, is onvolledig of is verouderd voor de actuele opdracht, kandidaat, bewijzen, controles of conceptoplevering.",
    });
  for (const round of input.repairRounds ?? []) {
    if (
      !reviewsContain(input, round.fromReviewId) ||
      !Array.isArray(round.retests) ||
      round.retests.length === 0
    )
      findings.push({
        code: "REPAIR_EVIDENCE_MISSING",
        subject: round.id,
        detail: "Herstelronde mist een eerdere review of gerichte nacontroles.",
      });
  }
  return {
    ...base,
    candidate: input.candidate ?? null,
    checkInventory: input.checkInventory ?? [],
    reviewBindings: bindings,
    review,
    reviewHistory,
    repairRounds: input.repairRounds ?? [],
    findings,
  };
}

function reviewsContain(input, id) {
  return (
    known(id) &&
    (input.reviews ?? (input.review ? [input.review] : [])).some(
      (review) => review.id === id,
    )
  );
}

const cell = (value) =>
  String(value ?? "unknown")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
function table(headers, rows) {
  return [headers, headers.map(() => "---"), ...rows]
    .map((row) => `| ${row.map(cell).join(" | ")} |`)
    .join("\n");
}

export function renderReport(report) {
  return `# Gauntlet — adviserend lokaal rapport

Geen automatische oplevergoedkeuring. supported betekent: passend bij aangeleverde labels; inhoudelijke beoordeling blijft nodig.

## Vereiste uitkomst

${cell(report.outcome)}

${table(
  ["Eis", "Omschrijving", "Status", "Redenen"],
  report.requirements.map((r) => [
    r.id,
    r.text,
    r.state,
    r.reasons.join(", ") || "—",
  ]),
)}

## Uitgevoerd onderzoek

${table(
  [
    "Bewijs",
    "Run",
    "Herkomst",
    "Status / exit",
    "Scope",
    "Uitvoering / labelbron",
    "Passed/failed/skipped",
    "Codeversie",
    "Fingerprint / huidige match",
    "Bron / moment",
  ],
  report.evidence.map((e) => [
    e.id,
    e.runId,
    e.provenance,
    `${e.status} / ${e.exitCode ?? "unknown"}`,
    e.scope,
    `${e.executionKind} / ${e.labelProvenance}`,
    e.counts
      ? `${e.counts.passed}/${e.counts.failed}/${e.counts.skipped}`
      : "unknown",
    e.revision,
    `${e.fingerprint} / ${e.currentFingerprint ?? "unknown"}`,
    `${e.source} / ${e.observedAt}`,
  ]),
)}

## Voorgenomen conclusies

${table(
  ["Claim", "Tekst", "Status", "Redenen"],
  report.conclusions.map((c) => [
    c.id,
    c.text,
    c.state,
    c.reasons.join(", ") || "—",
  ]),
)}

## Runcontext

${table(
  [
    "Run",
    "Target / runtime (opgegeven)",
    "Netwerk",
    "Bron",
    "Bevestigingsmoment",
  ],
  report.contexts.map((c) => [
    c.runId,
    `${c.target} / ${c.runtime}`,
    c.category,
    c.source,
    c.confirmedAt,
  ]),
)}

Netwerkbevestiging is alleen nodig voor een eis of conclusie met een specifieke netwerkcategorie. Deze tool stelt zelf geen vragen.

## Herbeoordeling na correctie

${table(
  ["Correctie", "Run", "Van → naar", "Bron / moment"],
  report.corrections.map((c) => [
    c.id,
    c.runId,
    `${c.from} → ${c.to}`,
    `${c.source} / ${c.confirmedAt}`,
  ]),
)}

${table(
  ["Run", "Soort", "Betrokken item"],
  report.affected.map((a) => [
    a.runId,
    a.kind,
    a.path ? `${a.path}${a.line ? `:${a.line}` : ""}` : a.id,
  ]),
)}

## Afzonderlijke review

Status: **${cell(report.review?.state ?? "not-run")}**. Huidige review: ${cell(report.review?.currentReviewId)}. Open of onbevestigd: ${cell(report.review?.openFindingCount ?? 0)}. Herstelronden: ${cell(report.review?.repairRoundCount ?? 0)}.

${table(
  ["Review", "Status", "Reviewer", "Fase 1", "Fase 2"],
  (report.reviewHistory ?? []).map((r) => [
    r.id,
    r.state,
    r.reviewer?.role,
    r.phase1?.recordedAt,
    r.phase2?.recordedAt,
  ]),
)}

${table(
  ["Bevinding", "Review", "Status", "Omschrijving"],
  (report.review?.findings ?? []).map((f) => [
    f.id,
    f.reviewId,
    f.status,
    f.text,
  ]),
)}

## Projectcontroles

${table(
  ["Controle", "Status", "Uitvoering", "Bewijs"],
  (report.checkInventory ?? []).map((c) => [
    c.id,
    c.status,
    c.executionKind,
    Array.isArray(c.evidence) ? c.evidence.join(", ") : c.evidence,
  ]),
)}

## Signalen en onbekenden

${report.findings.map((f) => `- **${f.code}** (${cell(f.subject)}): ${cell(f.detail)}`).join("\n")}

Alleen opgegeven bewijs en documentmappen zijn gecontroleerd. Directe verwijzingen: gewone inline Markdownlinks. Tekstherkenning is geen betekeniscontrole; ontbrekende informatie blijft onbekend. Oorspronkelijke inputs zijn niet gewijzigd.
`;
}

export function main(argv = process.argv.slice(2)) {
  const index = argv.indexOf("--input");
  if (
    index < 0 ||
    !argv[index + 1] ||
    argv.some(
      (arg, i) => !["--input", "--json"].includes(arg) && i !== index + 1,
    )
  ) {
    throw new Error(
      "Usage: node scripts/gauntlet.mjs --input <local-task.json> [--json]",
    );
  }
  const report = evaluate(
    JSON.parse(readLocal(process.cwd(), argv[index + 1])),
  );
  console.log(
    argv.includes("--json")
      ? JSON.stringify(report, null, 2)
      : renderReport(report),
  );
  return 0; // Advice is not a blocking gate; invalid input still exits 2 below.
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`Gauntlet input error: ${error.message}`);
    process.exitCode = 2;
  }
}

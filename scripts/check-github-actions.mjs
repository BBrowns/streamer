import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

function workflowFiles(root) {
  const directory = join(root, ".github", "workflows");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => join(directory, file));
}

export function findUnpinnedActions(root = process.cwd()) {
  const findings = [];
  for (const file of workflowFiles(root)) {
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        const match = line.match(/\buses:\s*([^\s#]+)@([^\s#]+)/);
        if (
          !match ||
          match[1].startsWith("./") ||
          /^[0-9a-f]{40}$/i.test(match[2])
        )
          return;
        findings.push({
          file: relative(root, file),
          line: index + 1,
          action: match[1],
          ref: match[2],
        });
      });
  }
  return findings;
}

const mergeQueueWorkflows = [
  ".github/workflows/ci.yml",
  ".github/workflows/dependency-review.yml",
];

export function findMissingMergeQueueTriggers(root = process.cwd()) {
  return mergeQueueWorkflows.filter((relativePath) => {
    const file = join(root, relativePath);
    if (!existsSync(file)) return true;
    const content = readFileSync(file, "utf8");
    return !/\n\s+merge_group:\s*\n\s+types:\s+\[checks_requested\]/.test(
      content,
    );
  });
}

export function findJobsWithoutTimeout(root = process.cwd()) {
  const findings = [];
  for (const file of workflowFiles(root)) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    let inJobs = false;
    let currentJob = null;
    let hasTimeout = false;

    const finishJob = () => {
      if (currentJob && !hasTimeout) {
        findings.push({ file: relative(root, file), job: currentJob });
      }
    };

    for (const line of lines) {
      if (/^jobs:\s*$/.test(line)) {
        inJobs = true;
        continue;
      }
      if (!inJobs) continue;
      if (/^[^\s]/.test(line)) {
        finishJob();
        currentJob = null;
        break;
      }
      const jobMatch = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
      if (jobMatch) {
        finishJob();
        currentJob = jobMatch[1];
        hasTimeout = false;
        continue;
      }
      if (currentJob && /^\s{4}timeout-minutes:\s*\d+\s*(?:#.*)?$/.test(line)) {
        hasTimeout = true;
      }
    }
    finishJob();
  }
  return findings;
}

export function main() {
  const findings = findUnpinnedActions();
  const missingMergeQueueTriggers = findMissingMergeQueueTriggers();
  const jobsWithoutTimeout = findJobsWithoutTimeout();
  if (findings.length > 0) {
    console.error("Every external GitHub Action must use a full commit SHA:");
    for (const finding of findings) {
      console.error(
        `- ${finding.file}:${finding.line} ${finding.action}@${finding.ref}`,
      );
    }
  }
  if (missingMergeQueueTriggers.length > 0) {
    console.error(
      "Required merge-queue workflows must handle checks_requested:",
    );
    for (const workflow of missingMergeQueueTriggers) {
      console.error(`- ${workflow}`);
    }
  }
  if (jobsWithoutTimeout.length > 0) {
    console.error("Every GitHub Actions job must define a finite timeout:");
    for (const finding of jobsWithoutTimeout) {
      console.error(`- ${finding.file} job ${finding.job}`);
    }
  }
  if (
    findings.length > 0 ||
    missingMergeQueueTriggers.length > 0 ||
    jobsWithoutTimeout.length > 0
  ) {
    return 1;
  }
  console.log(
    "All external GitHub Actions are pinned and merge-queue triggers are configured.",
  );
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}

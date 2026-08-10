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

export function main() {
  const findings = findUnpinnedActions();
  if (findings.length > 0) {
    console.error("Every external GitHub Action must use a full commit SHA:");
    for (const finding of findings) {
      console.error(
        `- ${finding.file}:${finding.line} ${finding.action}@${finding.ref}`,
      );
    }
    return 1;
  }
  console.log("All external GitHub Actions are pinned to full commit SHAs.");
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}

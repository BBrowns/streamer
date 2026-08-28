import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { validateSkillEvals } from "./validate-skill-evals.mjs";

export const EXPECTED_REPOSITORY_SKILLS = Object.freeze([
  "streamer-change-design",
  "streamer-contract-change",
  "streamer-delivery",
  "streamer-dependency-change",
  "streamer-incident-response",
  "streamer-reliability-change",
  "streamer-security-boundaries",
  "streamer-ui-change",
  "streamer-verification",
]);

const HANDOFF_REQUIRED_SECTIONS = Object.freeze([
  "## Current Project Phase",
  "## Active Work",
  "## Release Blockers",
  "## Next Actions",
  "## Canonical Sources",
]);

const HANDOFF_REQUIRED_SOURCES = Object.freeze([
  "ROADMAP.md",
  "ARCHITECTURE.md",
  "PLAYBACK.md",
  "docs/QA_MATRIX.md",
  "docs/RC_CHECKLIST.md",
  "docs/DEPENDENCY_SECURITY.md",
  "docs/AUTOMATED_GOLDEN_PATHS.md",
]);

export function validateAgentHandoff(root = process.cwd()) {
  const path = join(root, "AGENT_HANDOFF.md");
  if (!existsSync(path)) return ["AGENT_HANDOFF.md: missing"];

  const source = readFileSync(path, "utf8");
  const errors = [];
  for (const section of HANDOFF_REQUIRED_SECTIONS) {
    if (!source.includes(section)) {
      errors.push(`AGENT_HANDOFF.md: missing ${section}`);
    }
  }
  for (const requiredSource of HANDOFF_REQUIRED_SOURCES) {
    if (!source.includes(requiredSource)) {
      errors.push(
        `AGENT_HANDOFF.md: missing canonical source ${requiredSource}`,
      );
    }
  }

  const wordCount = source.match(/\S+/g)?.length ?? 0;
  if (wordCount > 1200) {
    errors.push(`AGENT_HANDOFF.md: exceeds 1200 words (${wordCount} words)`);
  }
  return errors;
}

function readFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const name = match[1].match(/^name:\s*([^\r\n]+)$/m)?.[1]?.trim();
  const description = match[1]
    .match(/^description:\s*([\s\S]*?)(?=\r?\n[a-zA-Z_-]+:|$)/m)?.[1]
    ?.trim();
  return { name, description };
}

function validateLocalMarkdownLinks(source, directory, label) {
  const errors = [];
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    if (!existsSync(join(directory, target))) {
      errors.push(`${label}: missing linked resource ${target}`);
    }
  }
  return errors;
}

export function validateMarkdownTreeLinks(directory, label) {
  const errors = [];
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.name.endsWith(".md")) {
        errors.push(
          ...validateLocalMarkdownLinks(
            readFileSync(path, "utf8"),
            dirname(path),
            `${label}/${relative(directory, path)}`,
          ),
        );
      }
    }
  }
  return errors;
}

export function validateHooks(hooks, root = process.cwd()) {
  const errors = [];
  const groups = hooks?.hooks;
  if (!groups || typeof groups !== "object") {
    return [".codex/hooks.json: missing hooks object"];
  }

  const findGroup = (event, matcher) => {
    const group = Array.isArray(groups[event])
      ? groups[event].find((candidate) => candidate?.matcher === matcher)
      : null;
    if (!group) {
      errors.push(`.codex/hooks.json: missing ${event}/${matcher} hook group`);
      return null;
    }
    if (
      !Array.isArray(group.hooks) ||
      group.hooks.some((hook) => hook?.type !== "command")
    ) {
      errors.push(
        `.codex/hooks.json: ${event}/${matcher} must contain command hooks`,
      );
    }
    return group;
  };

  const sessionStart = findGroup("SessionStart", "startup|resume");
  const preToolUse = findGroup("PreToolUse", "Bash");
  const commands = (group) =>
    Array.isArray(group?.hooks)
      ? group.hooks
          .map((hook) => hook?.command)
          .filter((command) => typeof command === "string")
      : [];
  const sessionCommands = commands(sessionStart);
  const bashCommands = commands(preToolUse);
  if (
    !sessionCommands.some((command) => command.includes("runtime_policy.py"))
  ) {
    errors.push(".codex/hooks.json: SessionStart must run runtime_policy.py");
  }
  if (!bashCommands.some((command) => command.includes("runtime_policy.py"))) {
    errors.push(
      ".codex/hooks.json: PreToolUse/Bash must run runtime_policy.py",
    );
  }
  if (!bashCommands.some((command) => command.includes("graphify_hook.py"))) {
    errors.push(".codex/hooks.json: PreToolUse/Bash must run graphify_hook.py");
  }
  for (const script of ["runtime_policy.py", "graphify_hook.py"]) {
    if (!existsSync(join(root, ".codex", "hooks", script))) {
      errors.push(`.codex/hooks/${script}: referenced hook script is missing`);
    }
  }
  return errors;
}

function parseMinimum(raw) {
  const match = /^>=(\d+)\.(\d+)\.(\d+)\s+<(\d+)$/.exec(raw ?? "");
  if (!match) return null;
  return {
    minimum: match.slice(1, 4).map(Number),
    maximumMajor: Number(match[4]),
  };
}

function readSupportedToolchain(root) {
  const packageJson = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  const node = parseMinimum(packageJson.engines?.node);
  const npm = parseMinimum(packageJson.engines?.npm);
  const expectedNpm = /^npm@(\d+\.\d+\.\d+)$/.exec(
    packageJson.packageManager ?? "",
  )?.[1];
  if (!node || !npm || !expectedNpm) {
    throw new Error(
      "engines and packageManager must define exact supported toolchain bounds",
    );
  }
  return {
    node,
    npm,
    nodeVersion: node.minimum.join("."),
    npmVersion: expectedNpm,
  };
}

export function validateToolchainProjections(root = process.cwd()) {
  const errors = [];
  try {
    const { nodeVersion, npmVersion, npm } = readSupportedToolchain(root);
    if (npm.minimum.join(".") !== npmVersion) {
      errors.push(
        `package.json: npm engine minimum ${npm.minimum.join(".")} differs from packageManager ${npmVersion}`,
      );
    }

    const nvmrc = readFileSync(join(root, ".nvmrc"), "utf8").trim();
    if (nvmrc !== nodeVersion) {
      errors.push(`.nvmrc: expected ${nodeVersion}; found ${nvmrc || "empty"}`);
    }

    const easPath = join(root, "apps", "mobile", "eas.json");
    const eas = JSON.parse(readFileSync(easPath, "utf8"));
    for (const profile of ["development", "preview", "production"]) {
      const actual = eas.build?.[profile]?.node;
      if (actual !== nodeVersion) {
        errors.push(
          `apps/mobile/eas.json: ${profile} Node must be ${nodeVersion}; found ${actual ?? "missing"}`,
        );
      }
    }

    const vendorPath = join(
      root,
      "apps",
      "desktop",
      "scripts",
      "vendor-node.js",
    );
    const vendorSource = readFileSync(vendorPath, "utf8");
    const vendorNode = /const NODE_VERSION = ["'](\d+\.\d+\.\d+)["']/.exec(
      vendorSource,
    )?.[1];
    if (vendorNode !== nodeVersion) {
      errors.push(
        `apps/desktop/scripts/vendor-node.js: Node must be ${nodeVersion}; found ${vendorNode ?? "missing"}`,
      );
    }

    const workflowRoot = join(root, ".github", "workflows");
    for (const file of readdirSync(workflowRoot).filter((name) =>
      /\.ya?ml$/.test(name),
    )) {
      const source = readFileSync(join(workflowRoot, file), "utf8");
      for (const match of source.matchAll(
        /NPM_VERSION:\s*["']?(\d+\.\d+\.\d+)["']?/g,
      )) {
        if (match[1] !== npmVersion) {
          errors.push(
            `.github/workflows/${file}: NPM_VERSION must be ${npmVersion}; found ${match[1]}`,
          );
        }
      }
      for (const match of source.matchAll(/npm@(\d+\.\d+\.\d+)/g)) {
        errors.push(
          `.github/workflows/${file}: inline npm pin ${match[1]} must use NPM_VERSION ${npmVersion}`,
        );
      }
      if (
        source.includes("npm@${NPM_VERSION}") &&
        !/NPM_VERSION:\s*["']?\d+\.\d+\.\d+["']?/.test(source)
      ) {
        errors.push(
          `.github/workflows/${file}: npm@\${NPM_VERSION} requires a workflow NPM_VERSION declaration`,
        );
      }
    }
  } catch (error) {
    errors.push(
      `toolchain projection validation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return errors;
}

export function validateRuntimePolicy(root = process.cwd()) {
  const errors = [];
  try {
    const { node, npm, npmVersion: expectedNpm } = readSupportedToolchain(root);

    const hook = join(root, ".codex", "hooks", "runtime_policy.py");
    const result = spawnSync("/usr/bin/python3", [hook, "--policy-json"], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      return [
        `.codex/hooks/runtime_policy.py: ${result.stderr.trim() || "policy query failed"}`,
      ];
    }
    const actual = JSON.parse(result.stdout);
    const expected = {
      node_min: node.minimum,
      node_max_major: node.maximumMajor,
      npm_min: npm.minimum,
      npm_max_major: npm.maximumMajor,
      expected_npm: expectedNpm,
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(
        ".codex/hooks/runtime_policy.py: effective policy differs from package.json",
      );
    }
    errors.push(...validateToolchainProjections(root));
  } catch (error) {
    errors.push(
      `runtime policy validation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return errors;
}

export function validateSkillArchitecture(root = process.cwd()) {
  const errors = [];
  const skillRoot = join(root, ".agents", "skills");
  if (!existsSync(skillRoot)) return ["missing .agents/skills"];

  const actual = readdirSync(skillRoot)
    .filter((name) => name.startsWith("streamer-"))
    .sort();
  const expected = [...EXPECTED_REPOSITORY_SKILLS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(
      `repository skills: expected ${expected.join(", ")}; found ${actual.join(", ")}`,
    );
  }
  if (existsSync(join(skillRoot, "get-api-docs"))) {
    errors.push(
      "get-api-docs: generic API documentation routing must not be repo-local",
    );
  }

  for (const skill of actual) {
    const directory = join(skillRoot, skill);
    const skillFile = join(directory, "SKILL.md");
    const metadataFile = join(directory, "agents", "openai.yaml");
    if (!existsSync(skillFile)) {
      errors.push(`${skill}: missing SKILL.md`);
      continue;
    }
    const source = readFileSync(skillFile, "utf8");
    const metadata = readFrontmatter(source);
    const lineCount = source.split(/\r?\n/).length;
    const wordCount = source.trim().split(/\s+/).length;
    if (!metadata?.name || metadata.name !== skill) {
      errors.push(`${skill}: frontmatter name must match directory`);
    }
    if (!metadata?.description || metadata.description.includes("TODO")) {
      errors.push(`${skill}: missing useful description`);
    }
    if (lineCount > 500 || wordCount > 800) {
      errors.push(
        `${skill}: SKILL.md exceeds the 500-line/800-word context budget (${lineCount} lines, ${wordCount} words)`,
      );
    }
    if (source.includes("[TODO:")) {
      errors.push(`${skill}: contains template TODO`);
    }
    errors.push(...validateMarkdownTreeLinks(directory, skill));
    if (!existsSync(metadataFile)) {
      errors.push(`${skill}: missing agents/openai.yaml`);
    } else {
      const metadataSource = readFileSync(metadataFile, "utf8");
      if (!metadataSource.includes("interface:")) {
        errors.push(`${skill}: missing interface metadata`);
      }
      if (!metadataSource.includes(`$${skill}`)) {
        errors.push(`${skill}: default_prompt must mention $${skill}`);
      }
    }
  }

  const graphifySkill = join(root, ".codex", "skills", "graphify", "SKILL.md");
  if (existsSync(graphifySkill)) {
    const source = readFileSync(graphifySkill, "utf8");
    const lineCount = source.split(/\r?\n/).length;
    const wordCount = source.trim().split(/\s+/).length;
    if (lineCount > 200 || wordCount > 500) {
      errors.push(
        `graphify: query entrypoint exceeds the 200-line/500-word budget (${lineCount} lines, ${wordCount} words)`,
      );
    }
    errors.push(
      ...validateMarkdownTreeLinks(
        join(root, ".codex", "skills", "graphify"),
        "graphify",
      ),
    );
  }

  return errors;
}

export function validateProcessAssets(root = process.cwd()) {
  const errors = [];
  const skillRoot = join(root, ".agents", "skills");
  if (!existsSync(skillRoot)) errors.push("missing .agents/skills");
  errors.push(...validateSkillArchitecture(root));
  errors.push(...validateSkillEvals(root, EXPECTED_REPOSITORY_SKILLS));

  const hookFile = join(root, ".codex", "hooks.json");
  if (!existsSync(hookFile)) {
    errors.push("missing .codex/hooks.json");
  } else {
    try {
      errors.push(
        ...validateHooks(JSON.parse(readFileSync(hookFile, "utf8")), root),
      );
    } catch {
      errors.push(".codex/hooks.json is not valid JSON");
    }
  }
  errors.push(...validateRuntimePolicy(root));
  errors.push(...validateAgentHandoff(root));

  const codexRoot = join(root, ".codex");
  if (existsSync(codexRoot)) {
    const stack = [codexRoot];
    while (stack.length > 0) {
      const directory = stack.pop();
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) stack.push(path);
        else if (/\.(json|toml|py|md)$/.test(entry.name)) {
          const source = readFileSync(path, "utf8");
          if (/\/Users\/|\/home\/[^/]+\//.test(source)) {
            errors.push(
              `${path.slice(root.length + 1)}: contains a machine-specific absolute path`,
            );
          }
        }
      }
    }
  }

  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  for (const skill of EXPECTED_REPOSITORY_SKILLS) {
    if (!agents.includes(skill))
      errors.push(`AGENTS.md: missing route for ${skill}`);
  }
  return errors;
}

export function main() {
  const errors = validateProcessAssets();
  if (errors.length > 0) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    return 1;
  }
  console.log("Process assets are valid.");
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}

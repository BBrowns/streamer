import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function readFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const name = match[1].match(/^name:\s*([^\r\n]+)$/m)?.[1]?.trim();
  const description = match[1]
    .match(/^description:\s*([\s\S]*?)(?=\r?\n[a-zA-Z_-]+:|$)/m)?.[1]
    ?.trim();
  return { name, description };
}

export function validateProcessAssets(root = process.cwd()) {
  const errors = [];
  const skillRoot = join(root, ".agents", "skills");
  if (!existsSync(skillRoot)) errors.push("missing .agents/skills");

  if (existsSync(skillRoot)) {
    for (const skill of readdirSync(skillRoot).filter((name) =>
      name.startsWith("streamer-"),
    )) {
      const directory = join(skillRoot, skill);
      const skillFile = join(directory, "SKILL.md");
      const metadataFile = join(directory, "agents", "openai.yaml");
      if (!existsSync(skillFile)) {
        errors.push(`${skill}: missing SKILL.md`);
        continue;
      }
      const source = readFileSync(skillFile, "utf8");
      const metadata = readFrontmatter(source);
      if (!metadata?.name || metadata.name !== skill) {
        errors.push(`${skill}: frontmatter name must match directory`);
      }
      if (!metadata?.description || metadata.description.includes("TODO")) {
        errors.push(`${skill}: missing useful description`);
      }
      if (source.includes("[TODO:"))
        errors.push(`${skill}: contains template TODO`);
      if (!existsSync(metadataFile)) {
        errors.push(`${skill}: missing agents/openai.yaml`);
      } else {
        const metadataSource = readFileSync(metadataFile, "utf8");
        if (!metadataSource.includes("interface:"))
          errors.push(`${skill}: missing interface metadata`);
        if (!metadataSource.includes(`$${skill}`))
          errors.push(`${skill}: default_prompt must mention $${skill}`);
      }
    }
  }

  const hookFile = join(root, ".codex", "hooks.json");
  if (!existsSync(hookFile)) {
    errors.push("missing .codex/hooks.json");
  } else {
    try {
      JSON.parse(readFileSync(hookFile, "utf8"));
    } catch {
      errors.push(".codex/hooks.json is not valid JSON");
    }
  }

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
  for (const skill of [
    "streamer-feature-framing",
    "streamer-resilience-design",
    "streamer-maintenance-radar",
  ]) {
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

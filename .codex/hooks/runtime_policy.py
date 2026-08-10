#!/usr/bin/env python3
"""Low-latency Codex runtime and destructive-command policy for Streamer."""

import json
import platform
import re
import subprocess
import sys


NODE_MIN = (24, 18, 0)
NODE_MAX_MAJOR = 25
NPM_MIN = (11, 18, 0)
NPM_MAX_MAJOR = 12
EXPECTED_NPM = "11.18.0"

DESTRUCTIVE_PATTERNS = (
    (re.compile(r"(?:^|[;&|]\s*)git\s+reset\s+--hard(?:\s|$)"), "git reset --hard"),
    (re.compile(r"(?:^|[;&|]\s*)git\s+clean\s+-[^\s]*f[^\s]*(?:\s|$)"), "git clean with force"),
    (
        re.compile(
            r"(?:^|[;&|]\s*)git\s+push\b[^\n;&|]*(?:--force(?:-with-lease|-if-includes)?|(?:^|\s)-f(?:\s|$))"
        ),
        "forced git push",
    ),
)

DEPENDENCY_MUTATION = re.compile(
    r"(?:^|[;&|]\s*)(?:npm\s+(?:ci|i|install|rebuild|uninstall|remove|update|upgrade)\b|npx\b[^;&|\n]*\bnpm@[^\s]+\s+(?:ci|i|install|rebuild)\b)"
)
NATIVE_RUNTIME = re.compile(
    r"(?:npm\s+run\s+(?:dev:(?:desktop|stream-server|repair-native)|test:electron-smoke|package(?::[^\s]+)?|vendor)\b|"
    r"npm\b[^;&|\n]*--workspace=(?:@streamer/(?:desktop|stream-server)|apps/desktop)\b|"
    r"\b(?:electron-builder|node-gyp)\b)"
)
PINNED_NPM_COMMAND = re.compile(
    r"^\s*npx(?:\s+--[a-z-]+(?:=[^\s]+)?)*\s+npm@11\.18\.0\s+"
    r"(?:ci|i|install|rebuild)\b[^;&|\n]*$"
)


def parse_version(raw):
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", raw or "")
    return tuple(int(part) for part in match.groups()) if match else None


def normalize_arch(raw):
    value = (raw or "").strip().lower()
    return {"aarch64": "arm64", "x86_64": "x64", "amd64": "x64"}.get(
        value, value
    )


def run_version_command(command):
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=2,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def inspect_toolchain():
    node_raw = run_version_command(["node", "--version"])
    npm_raw = run_version_command(["npm", "--version"])
    node_arch_raw = run_version_command(["node", "-p", "process.arch"])
    node_version = parse_version(node_raw)
    npm_version = parse_version(npm_raw)
    host_arch = normalize_arch(platform.machine())
    node_arch = normalize_arch(node_arch_raw)

    issues = []
    if node_version is None:
        issues.append("node")
    elif node_version < NODE_MIN or node_version[0] >= NODE_MAX_MAJOR:
        issues.append("node")

    if npm_version is None:
        issues.append("npm")
    elif npm_version < NPM_MIN or npm_version[0] >= NPM_MAX_MAJOR:
        issues.append("npm")

    if host_arch and node_arch and host_arch != node_arch:
        issues.append("arch")

    return {
        "node": node_raw or "missing",
        "npm": npm_raw or "missing",
        "host_arch": host_arch or "unknown",
        "node_arch": node_arch or "unknown",
        "issues": issues,
    }


def runtime_warning(status):
    if not status["issues"]:
        return None
    return (
        "Streamer runtime mismatch: expected Node >=24.18.0 <25 and npm "
        f">=11.18.0 <12 on {status['host_arch']}; found Node {status['node']}, "
        f"npm {status['npm']}, Node arch {status['node_arch']}. Run `nvm use` "
        f"and use npm {EXPECTED_NPM} before dependency or native-runtime work."
    )


def blocking_reason(command, status=None):
    for pattern, label in DESTRUCTIVE_PATTERNS:
        if pattern.search(command):
            return f"Blocked {label}; use a non-destructive alternative or disable the hook after explicit user authorization."

    if not (DEPENDENCY_MUTATION.search(command) or NATIVE_RUNTIME.search(command)):
        return None

    status = status or inspect_toolchain()
    issues = list(status["issues"])
    if PINNED_NPM_COMMAND.search(command):
        issues = [issue for issue in issues if issue != "npm"]
    if not issues:
        return None

    return runtime_warning({**status, "issues": issues})


def deny_output(reason):
    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }


def read_payload():
    try:
        return json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return {}


def main():
    payload = read_payload()
    event_name = payload.get("hook_event_name")

    if event_name == "SessionStart":
        warning = runtime_warning(inspect_toolchain())
        if warning:
            print(warning)
        return 0

    if event_name != "PreToolUse" or payload.get("tool_name") != "Bash":
        return 0

    tool_input = payload.get("tool_input")
    command = tool_input.get("command", "") if isinstance(tool_input, dict) else ""
    if not isinstance(command, str):
        return 0

    reason = blocking_reason(command)
    if reason:
        print(json.dumps(deny_output(reason), separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

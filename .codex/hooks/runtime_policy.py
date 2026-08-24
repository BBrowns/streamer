#!/usr/bin/env python3
"""Low-latency Codex runtime and destructive-command policy for Streamer."""

import json
import platform
import re
import subprocess
import sys
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]

DESTRUCTIVE_PATTERNS = (
    (re.compile(r"\bgit\s+reset\s+--hard(?:\s|$)"), "git reset --hard"),
    (re.compile(r"\bgit\s+clean\s+-[^\s]*f[^\s]*(?:\s|$)"), "git clean with force"),
    (
        re.compile(
            r"\bgit\s+push\b[^\n;&|]*(?:--force(?:-with-lease|-if-includes)?|(?:^|\s)-f(?:\s|$))"
        ),
        "forced git push",
    ),
)

DEPENDENCY_MUTATION = re.compile(
    r"(?:\bnpm\s+(?:ci|i|install|rebuild|uninstall|remove|update|upgrade)\b|\bnpx\b[^;&|\n]*\bnpm@[^\s]+\s+(?:ci|i|install|rebuild)\b)"
)
NATIVE_RUNTIME = re.compile(
    r"(?:\bnpm\s+run\s+(?:dev:(?:desktop|stream-server|repair-native)|test:electron-smoke|package(?::[^\s]+)?|vendor)\b|"
    r"\bnpm\b[^;&|\n]*--workspace=(?:@streamer/(?:desktop|stream-server)|apps/desktop)\b|"
    r"\b(?:electron-builder|node-gyp)\b)"
)
UNSUPPORTED_SHELL = re.compile(r"(?:\r|\n|`|\$\(|\(\s*(?:git|npm|npx)\b|\b(?:bash|sh|zsh)\s+-c\b)")
def parse_version(raw):
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", raw or "")
    return tuple(int(part) for part in match.groups()) if match else None


def parse_engine_range(raw, label):
    match = re.fullmatch(r">=(\d+\.\d+\.\d+)\s+<(\d+)", raw or "")
    if not match:
        raise ValueError(
            f"package.json engines.{label} must use '>=x.y.z <major'"
        )
    minimum = parse_version(match.group(1))
    return minimum, int(match.group(2))


def load_toolchain_policy(root=REPOSITORY_ROOT):
    package = json.loads((Path(root) / "package.json").read_text(encoding="utf-8"))
    node_min, node_max_major = parse_engine_range(
        package.get("engines", {}).get("node"), "node"
    )
    npm_min, npm_max_major = parse_engine_range(
        package.get("engines", {}).get("npm"), "npm"
    )
    package_manager = package.get("packageManager", "")
    manager_match = re.fullmatch(r"npm@(\d+\.\d+\.\d+)", package_manager)
    if not manager_match:
        raise ValueError("package.json packageManager must pin npm@x.y.z")
    expected_npm = manager_match.group(1)
    if parse_version(expected_npm) != npm_min:
        raise ValueError(
            "package.json packageManager must match the engines.npm minimum"
        )
    return {
        "node_min": node_min,
        "node_max_major": node_max_major,
        "npm_min": npm_min,
        "npm_max_major": npm_max_major,
        "expected_npm": expected_npm,
    }


def is_pinned_npm_command(command, expected_npm):
    pattern = re.compile(
        r"^\s*npx(?:\s+--[a-z-]+(?:=[^\s]+)?)*\s+npm@"
        + re.escape(expected_npm)
        + r"\s+(?:ci|i|install|rebuild)\b[^;&|\n]*$"
    )
    return pattern.search(command) is not None


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


def inspect_toolchain(policy=None):
    policy = policy or load_toolchain_policy()
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
    elif (
        node_version < policy["node_min"]
        or node_version[0] >= policy["node_max_major"]
    ):
        issues.append("node")

    if npm_version is None:
        issues.append("npm")
    elif (
        npm_version < policy["npm_min"]
        or npm_version[0] >= policy["npm_max_major"]
    ):
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


def format_version(version):
    return ".".join(str(part) for part in version)


def runtime_warning(status, policy=None):
    policy = policy or load_toolchain_policy()
    if not status["issues"]:
        return None
    return (
        f"Streamer runtime mismatch: expected Node >="
        f"{format_version(policy['node_min'])} <{policy['node_max_major']} and npm "
        f">={format_version(policy['npm_min'])} <{policy['npm_max_major']} on "
        f"{status['host_arch']}; found Node {status['node']}, "
        f"npm {status['npm']}, Node arch {status['node_arch']}. Run `nvm use` "
        f"and use npm {policy['expected_npm']} before dependency or native-runtime work."
    )


def blocking_reason(command, status=None, policy=None):
    for pattern, label in DESTRUCTIVE_PATTERNS:
        if pattern.search(command):
            if UNSUPPORTED_SHELL.search(command):
                return (
                    f"Blocked {label} inside unsupported shell syntax; use a simple command "
                    "or disable the hook after explicit user authorization."
                )
            return f"Blocked {label}; use a non-destructive alternative or disable the hook after explicit user authorization."

    if not (DEPENDENCY_MUTATION.search(command) or NATIVE_RUNTIME.search(command)):
        return None

    policy = policy or load_toolchain_policy()
    status = status or inspect_toolchain(policy)
    issues = list(status["issues"])
    if is_pinned_npm_command(command, policy["expected_npm"]):
        issues = [issue for issue in issues if issue != "npm"]
    if not issues:
        return None

    return runtime_warning({**status, "issues": issues}, policy)


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
    if "--policy-json" in sys.argv[1:]:
        print(json.dumps(load_toolchain_policy(), separators=(",", ":")))
        return 0

    payload = read_payload()
    event_name = payload.get("hook_event_name")

    if event_name == "SessionStart":
        policy = load_toolchain_policy()
        warning = runtime_warning(inspect_toolchain(policy), policy)
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

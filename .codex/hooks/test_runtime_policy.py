#!/usr/bin/env python3

import importlib.util
import pathlib
import unittest
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).with_name("runtime_policy.py")
SPEC = importlib.util.spec_from_file_location("runtime_policy", MODULE_PATH)
runtime_policy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime_policy)


def status(*issues):
    return {
        "node": "v26.7.0",
        "npm": "12.0.2",
        "host_arch": "arm64",
        "node_arch": "arm64",
        "issues": list(issues),
    }


class RuntimePolicyTest(unittest.TestCase):
    def test_loads_toolchain_policy_from_package_json(self):
        policy = runtime_policy.load_toolchain_policy()

        self.assertEqual(policy["node_min"], (26, 7, 0))
        self.assertEqual(policy["node_max_major"], 27)
        self.assertEqual(policy["npm_min"], (12, 0, 2))
        self.assertEqual(policy["npm_max_major"], 13)
        self.assertEqual(policy["expected_npm"], "12.0.2")

    def test_warning_reports_the_repository_policy(self):
        warning = runtime_policy.runtime_warning(status("node", "npm"))

        self.assertIn("Node >=26.7.0 <27", warning)
        self.assertIn("npm >=12.0.2 <13", warning)

    def test_allows_normal_commands_without_runtime_checks(self):
        self.assertIsNone(runtime_policy.blocking_reason("npm test", status("npm")))

    def test_blocks_destructive_git_commands(self):
        commands = (
            "git reset --hard HEAD~1",
            "git clean -fdx",
            "git push origin master --force-with-lease",
        )
        for command in commands:
            with self.subTest(command=command):
                self.assertIn("Blocked", runtime_policy.blocking_reason(command, status()))

    def test_destructive_policy_does_not_depend_on_a_valid_package_manifest(self):
        with mock.patch.object(
            runtime_policy,
            "load_toolchain_policy",
            side_effect=ValueError("malformed package.json"),
        ):
            reason = runtime_policy.blocking_reason("git reset --hard HEAD~1")

        self.assertIn("Blocked git reset --hard", reason)

    def test_blocks_destructive_git_commands_inside_shell_wrappers(self):
        commands = (
            "printf ready\ngit reset --hard HEAD~1",
            'echo "$(git clean -fdx)"',
            "FOO=1 git push origin master --force-with-lease",
        )
        for command in commands:
            with self.subTest(command=command):
                self.assertIn("Blocked", runtime_policy.blocking_reason(command, status()))

    def test_blocks_dependency_mutation_after_an_environment_prefix(self):
        reason = runtime_policy.blocking_reason("NPM_CONFIG_LOGLEVEL=silent npm ci", status("npm"))
        self.assertIn("runtime mismatch", reason)

    def test_blocks_dependency_mutation_with_wrong_npm(self):
        reason = runtime_policy.blocking_reason("npm ci", status("npm"))
        self.assertIn("runtime mismatch", reason)

    def test_allows_explicitly_pinned_npm_when_only_npm_is_wrong(self):
        command = "npx --yes npm@12.0.2 ci --no-audit --no-fund"
        self.assertIsNone(runtime_policy.blocking_reason(command, status("npm")))

    def test_pinned_npm_does_not_bypass_node_or_arch_checks(self):
        command = "npx --yes npm@12.0.2 install"
        reason = runtime_policy.blocking_reason(command, status("node", "npm", "arch"))
        self.assertIn("runtime mismatch", reason)

    def test_pinned_npm_text_does_not_bypass_an_unpinned_install(self):
        command = "npm install; echo npm@12.0.2"
        reason = runtime_policy.blocking_reason(command, status("npm"))
        self.assertIn("runtime mismatch", reason)

    def test_old_pinned_npm_does_not_bypass_current_policy(self):
        command = "npx --yes npm@11.18.0 ci --no-audit --no-fund"
        reason = runtime_policy.blocking_reason(command, status("npm"))

        self.assertIn("runtime mismatch", reason)

    def test_blocks_native_runtime_with_wrong_architecture(self):
        reason = runtime_policy.blocking_reason(
            "npm run dev:desktop", status("arch")
        )
        self.assertIn("runtime mismatch", reason)

    def test_emits_current_pretooluse_denial_shape(self):
        output = runtime_policy.deny_output("blocked")
        self.assertEqual(
            output["hookSpecificOutput"]["permissionDecision"], "deny"
        )
        self.assertEqual(
            output["hookSpecificOutput"]["hookEventName"], "PreToolUse"
        )


if __name__ == "__main__":
    unittest.main()

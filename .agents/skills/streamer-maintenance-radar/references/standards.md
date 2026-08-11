# Maintenance Radar Standards

## Evidence Sources

- local Git status, recent history, and changed process files;
- CI run health and required status contexts;
- workflow action pinning and permissions;
- dependency drift, advisories, install-script policy, and audit exceptions;
- aggregate CodeQL, Dependabot, and Sentry state;
- temporary flags, adapters, compatibility shims, and stale documentation.

Unavailable access is a reportable limitation, not permission to guess.

## Priority Rules

- Prioritize user impact, active release risk, security exposure, and control
  expiry over age or convenience.
- A finding needs an owner and a bounded next action before it becomes `Now` or
  `Next`.
- Do not make an existing backlog look new merely because a scheduled report
  ran. Use timestamps and the lookback window, and repeat only unresolved
  material risk.
- Keep the output small enough to read in one pass.

## Primary References

- [OpenAI scheduled tasks](https://learn.chatgpt.com/docs/automations)
- [GitHub Dependabot configuration](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file)
- [GitHub ruleset rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

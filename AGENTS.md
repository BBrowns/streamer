## graphify

Graphify is an optional navigation accelerator. When
`graphify-out/graph.json` exists, query it before broad source search and verify
its results against the named source files and tests. Use `graphify path` for a
relationship and `graphify explain` for one concept. If the graph is missing,
continue with `rg` and source inspection; do not build it for an ordinary
codebase question.

Use the `graphify` skill when the user invokes `/graphify`, asks to build or
update the graph, or when an existing graph should be queried. Refresh a stale
graph before relying on it for broad or risky impact analysis. Generated
`graphify-out/` files stay uncommitted unless the user explicitly requests them.

## Tool Routing

- Use `streamer-change-design` for ambiguous material changes and changes to
  ownership, state lifecycle, dependency direction, runtime boundaries, or a
  component's durable shape. Skip it for trivial fixes and decision-complete
  local work.
- Use `streamer-contract-change` for shared, serialized, persisted, API, IPC,
  bridge, or event contracts and their compatibility or migration path.
- Use `streamer-reliability-change` for timeouts, retries, cancellation,
  idempotency, backpressure, degraded modes, recovery, and bounded telemetry
  across independently failing boundaries.
- Use `streamer-security-boundaries` when trust, privilege, exposure, or
  sensitive-data handling changes across authentication, untrusted input,
  networking, IPC/native bridges, files, processes, persistence, telemetry,
  permissions, or release hardening. Unchanged Electron/bridge placement alone
  is not a trigger.
- Use `streamer-dependency-change` when a manifest, lockfile, package version,
  override, patch, install-script approval, native dependency, or audit
  exception changes.
- Use `streamer-ui-change` for meaningful mobile or Electron UI work,
  responsive behavior, accessibility, screenshots, and visual regression.
  `UI.md` and shared tokens outrank external design suggestions.
- Use `streamer-incident-response` for production or release-candidate
  failures, Sentry reports, severe regressions, and measured performance
  incidents. Use ordinary debugging for local failures.
- Use `streamer-verification` for explicit verification requests and material,
  risky, multi-file, cross-workspace, contract, dependency, security, native,
  release, or process work. Trivial docs/local edits may run the mapped light
  check directly with `npm run verify:change`.
- Use `streamer-delivery` only for explicit branch, staging, commit, PR, CI,
  merge, handoff, or release work. Publishing still requires explicit user
  authorization.
- For scheduled or explicit read-only repository health reviews, use
  `npm run maintenance:report -- --since-days 7`; maintenance never edits source
  or external state.
- For broad UI exploration, use at most two relevant external specialists
  (`vercel-react-native-skills`, `web-design-guidelines`, `ui-ux-pro-max`, or
  `frontend-design`) and keep project UI, accessibility, security, and
  compatibility contracts authoritative.
- Use `research-before-planning` when the user explicitly asks for current online research before a plan; research supplies evidence for feature framing and does not silently authorize implementation.
- Use Context Hub first for curated API references. When it lacks the relevant library or exact version, use Context7 and include the library version in the query.
- Use Playwright or the browser tool for deterministic user flows. Use Chrome DevTools for console, network, Lighthouse, and performance diagnosis; do not duplicate the same browser workflow across both tools without a concrete reason.
- Use Sentry as read-only production evidence after checking local code, tests, and logs. Long-tail Sentry reads are discovered through `search_sentry_tools` and invoked through `execute_sentry_tool`; request approval before that gateway call and never use it for a write. Never copy tokens, user data, resolved media URLs, magnets, info hashes, or bridge URLs from telemetry into source, issues, memory, or agent output.
- Agent memory is for durable project decisions, conventions, and recurring pitfalls. Fetch it for broad or risky work, but propose updates only when the information remains useful across tasks. Never store temporary task state, credentials, personal data, or readily derivable code facts. Memory updates require review.
- Treat current code as evidence, not automatically as the desired standard.
  Preserve explicit safety, compatibility, product, and ownership contracts and
  use a scoped migration when stronger standards conflict with legacy code.

## Development Cycle

- Frame the outcome and risk first for material work. Choose repair, refactor,
  split, merge, or replacement from evidence rather than defaulting to the
  current component shape.
- Use only the project skills whose trigger matches. Routine or fully specified
  work should not accumulate generic brainstorming, planning, subagent, and
  review workflows by default.
- Keep the normal order: external research only when requested, change design
  when needed, a decision-complete plan for material work, implementation,
  expanding-ring verification, then delivery evidence when requested.
- Use the `risk_reviewer` project agent for an independent read-only pass on broad or high-risk changes. Use `runtime_verifier` after implementation when noisy test, browser, or Electron evidence can be gathered independently. Do not delegate overlapping writes, and do not spawn either agent for routine narrow work.
- Make behavior changes red-green-refactor where practical; use characterization tests before reshaping behavior-preserving components.
- Use property-based or model-based testing only for meaningful invariants over broad input or state spaces. Start with one or two focused properties before adding a generative-testing dependency.
- Verify in expanding rings from the affected owner to consumers and repository gates. Skills choose evidence; repository scripts remain the hard gates.
- Finish with delivery evidence proportional to risk. Feed genuine production failures back through incident response, regression coverage, and reviewed durable decisions.
- Temporary adapters, feature flags, dual paths, audit exceptions, and compatibility shims need an owner and removal condition so evolutionary work does not become permanent process or code debt.
- Use the maintenance report weekly or on demand to turn changed CI,
  dependency, security, release, and process evidence into a small prioritized
  queue. A scheduled workflow may store only its bounded Markdown/JSON artifact
  and must remain read-only toward GitHub.
- Treat `architecture-budgets.json` and `docs/ARCHITECTURE_MAINTENANCE.md` as
  architecture gates. A temporary module exception requires an owner, reason,
  next action, and review deadline; never increase a budget to avoid a split.

## Project Rules

- This is an npm 12.0.2 / Node 26.7.0 monorepo. Use the repository scripts and the runtime guard; do not bypass `scripts/dev-runtime.cjs` for native bridge work.
- Read the task-specific reference before changing a subsystem: `ARCHITECTURE.md` for ownership and service boundaries, `PLAYBACK.md` for session and stream contracts, `UI.md` for mobile UI behavior, and `AGENT_HANDOFF.md` for current priorities and known gaps.
- Keep shared API types and Zod schemas in `packages/shared`. Do not duplicate cross-client contracts in the server or mobile app.
- Playback sessions and events must remain persistence-safe: never persist or log resolved media URLs, magnets, info hashes, raw `Stream` objects, or bridge URLs. Keep Play Best as the primary flow; manual source selection is an advanced fallback.
- Preserve platform ownership: Electron owns its desktop bridge sidecar; the API bridge supervisor is opt-in. Do not bypass add-on source-safety checks or enable private-network add-ons in production defaults.
- For UI work, preserve the token-based adaptive theme and responsive Expo patterns. Run phone and desktop screenshot/browser QA for meaningful UI changes; do not introduce a parallel UI framework or a marketing landing page.
- Keep Electron's security boundary intact: no raw `ipcRenderer` exposure, no unreviewed IPC handlers, and no arbitrary remote renderer origins. Follow `docs/ELECTRON_SECURITY.md` for desktop changes.
- Do not add secrets to source, fixtures, snapshots, logs, or commits. Do not run integration tests against a development or production database; use the isolated test database flow documented in the README.
- Project Codex hooks are intentionally limited to runtime preflight and high-confidence command guards. Keep them fast, deterministic, and quiet on success; review changed hook definitions with `/hooks` before relying on them.
- Graphify is an optional local accelerator. The project hook must resolve it through `PATH` or the conventional local installation path and silently allow clones where it is not installed.
- External UI specialists are optional. `streamer-ui-change` remains sufficient
  when one is unavailable; do not let an absent specialist block routine work.
- Keep changes scoped. Do not stage unrelated worktree changes or dependency/lockfile churn unless the task requires it. Update relevant documentation when a user-facing behavior, contract, environment variable, or release process changes.

## Validation

- Run the narrowest relevant checks first: workspace tests plus typecheck for changed packages. Run `npm run lint`, `npm run typecheck:all`, and `npm run format:check` for cross-workspace or high-risk changes when feasible.
- Process-only changes: run `npm run process:check`, the hook tests, skill validators, and the maintenance-collector tests before broader repository gates.
- Server/database changes: run `npm run test:server:integration` when Docker or an explicitly disposable test database is available.
- Mobile UI or user-flow changes: run the affected Jest tests and `npm run test:golden-path` when the change affects a golden path; inspect phone and desktop output.
- Stream-server or desktop bridge changes: run `npm run test --workspace=@streamer/stream-server` and the focused bridge/runtime checks. Do not claim device-specific playback, download, or casting validation without running it on the relevant real device or simulator.

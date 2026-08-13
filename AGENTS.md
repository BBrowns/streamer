## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Prefer the `graphify-streamer` MCP tools when they are available; use the local `graphify` CLI as the fallback.
- Treat graph results as navigation and impact-analysis context, not as the source of truth. Before changing behavior, read the relevant source files and tests named by the graph.
- Before relying on a graph for a broad or risky change, check whether the working tree contains code changes made after the graph was built. Refresh with `graphify update .` when it is stale.
- `graphify update .` only refreshes structural code extraction. After changing documentation, images, video, or other non-code artifacts, rebuild with `graphify extract . --force` when those artifacts matter to the task.
- Do not stage or commit `graphify-out/` by default. It is generated local context; commit it only when the user explicitly asks to version the graph artifacts.

## Tool Routing

- Use the project skill `streamer-ui-quality` for meaningful UI implementation, refactoring, design review, responsive behavior, accessibility, screenshots, or visual-regression work.
- Use `streamer-feature-framing` before planning material features, ambiguous product changes, broad refactors, or component reshaping when the outcome or acceptance criteria are not decision-complete. Skip it for trivial fixes and fully specified tasks.
- Use `streamer-resilience-design` for timeouts, retries, cancellation, idempotency, backpressure, degraded modes, recovery, or fault-injection work across independently failing boundaries.
- Use `streamer-maintenance-radar` for scheduled or explicit read-only health reviews; it may report drift but never edits source, opens issues, changes settings, or creates PRs.
- Use `vercel-react-native-skills` only for React Native or Expo performance, animation, list, native-module, image, safe-area, or monorepo-native-dependency work.
- Use `web-design-guidelines` only for explicit web or Electron renderer UI audits against current interface guidelines.
- Use `ui-ux-pro-max` for new design exploration, product-specific design-system generation, or on-demand UI/UX research; do not let its generated recommendations override `UI.md` or the shared tokens without review.
- Use `frontend-design` only when a new surface needs an explicitly distinctive visual direction; do not apply it automatically to operational Streamer screens.
- Treat `streamer-ui-quality` as the primary UI router. Load no specialist for routine UI changes and at most two specialists for broad redesigns; resolve conflicts using project contracts, accessibility, security, platform, and compatibility requirements first.
- Use `streamer-architecture-guardrails` when a change alters ownership, state lifecycle, dependency direction, runtime or trust boundaries, or the durable shape of a component. Routine compatible contract changes do not require architecture review.
- Use `streamer-contract-evolution` when changing shared or serialized schemas, API/IPC/bridge/event contracts, persisted forms, migrations, version compatibility, or contract retirement. Keep local one-owner types out of this workflow.
- Use `streamer-dependency-upgrades` when a manifest, lockfile, package version, override, patch, install-script approval, native dependency, or audit exception changes.
- Use `streamer-performance-profiling` only for a measurable performance problem, regression, or budget. Establish a representative baseline before optimizing; use platform specialists only after the bottleneck is localized.
- Use `streamer-test-strategy` for TDD, regression coverage, test-layer selection, flaky tests, test data, and verification planning.
- Use `streamer-observability-design` when adding or changing production logs, metrics, traces, Sentry context, dashboards, alerts, sampling, SLIs, or SLOs. Start from an operational decision, keep dimensions bounded, and preserve Streamer redaction contracts.
- Use `streamer-security-review` for authentication, authorization, untrusted input, URLs, networking, sensitive persistence, IPC, native bridges, secrets, telemetry, privileged dependencies, install-script or provenance risk, permissions, or release hardening. Routine compatible dependency updates use the dependency skill alone.
- Use `streamer-incident-triage` for production or release-candidate incidents, Sentry issues, severe user reports, post-release regressions, containment planning, and post-incident learning. Ordinary local failures use systematic debugging instead.
- Use `streamer-delivery-readiness` for branch, staging, commit, pull-request, CI, merge, or release-readiness work. Publishing actions still require an explicit user request.
- Use `research-before-planning` when the user explicitly asks for current online research before a plan; research supplies evidence for feature framing and does not silently authorize implementation.
- Use Context Hub first for curated API references. When it lacks the relevant library or exact version, use Context7 and include the library version in the query.
- Use Playwright or the browser tool for deterministic user flows. Use Chrome DevTools for console, network, Lighthouse, and performance diagnosis; do not duplicate the same browser workflow across both tools without a concrete reason.
- Use Sentry as read-only production evidence after checking local code, tests, and logs. Long-tail Sentry reads are discovered through `search_sentry_tools` and invoked through `execute_sentry_tool`; request approval before that gateway call and never use it for a write. Never copy tokens, user data, resolved media URLs, magnets, info hashes, or bridge URLs from telemetry into source, issues, memory, or agent output.
- Agent memory is for durable project decisions, conventions, and recurring pitfalls. Fetch it for broad or risky work, but propose updates only when the information remains useful across tasks. Never store temporary task state, credentials, personal data, or readily derivable code facts. Memory updates require review.
- The project skills are standards-first: treat current code as evidence, not automatically as the desired pattern. Preserve explicit safety, compatibility, product, and ownership contracts; when a stronger standard conflicts with legacy implementation, identify the gap and use a scoped migration.
- The installed Superpowers plugin supplies execution workflows such as red-green-refactor, systematic debugging, review, and verification. Use the project skills above to select the applicable architecture, test, security, UI, and delivery standards.

## Development Cycle

- Frame the outcome and risk first for material work. Choose repair, refactor, split, merge, or replacement from evidence rather than defaulting to the current component shape.
- Use Superpowers for execution discipline, then add only the project specialists whose triggers apply. Do not load the complete cycle or every review skill for routine work.
- Keep the normal order: research when explicitly requested, feature framing when needed, a decision-complete plan, Superpowers execution discipline, only the applicable specialists, then expanding-ring verification and delivery evidence.
- Use the `risk_reviewer` project agent for an independent read-only pass on broad or high-risk changes. Use `runtime_verifier` after implementation when noisy test, browser, or Electron evidence can be gathered independently. Do not delegate overlapping writes, and do not spawn either agent for routine narrow work.
- Make behavior changes red-green-refactor where practical; use characterization tests before reshaping behavior-preserving components.
- Use property-based or model-based testing only for meaningful invariants over broad input or state spaces. Start with one or two focused properties before adding a generative-testing dependency.
- Verify in expanding rings from the affected owner to consumers and repository gates. Skills choose evidence; repository scripts remain the hard gates.
- Finish with delivery evidence proportional to risk. Feed genuine production failures back through incident triage, regression coverage, and reviewed durable decisions.
- Temporary adapters, feature flags, dual paths, audit exceptions, and compatibility shims need an owner and removal condition so evolutionary work does not become permanent process or code debt.
- Use the maintenance radar weekly or on demand to turn changed CI, dependency, security, release, and process evidence into a small prioritized queue. Do not make it an automatic fixer.
- Use `npm run maintenance:report -- --since-days 7` when a human-readable
  maintenance receipt is needed; the scheduled workflow may store only its
  bounded Markdown/JSON artifact and must remain read-only toward GitHub.
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
- External UI specialists (`frontend-design`, `vercel-react-native-skills`, `web-design-guidelines`, and `ui-ux-pro-max`) are optional local installations. `streamer-ui-quality` remains sufficient when one is unavailable; do not let an absent specialist block routine work.
- Keep changes scoped. Do not stage unrelated worktree changes or dependency/lockfile churn unless the task requires it. Update relevant documentation when a user-facing behavior, contract, environment variable, or release process changes.

## Validation

- Run the narrowest relevant checks first: workspace tests plus typecheck for changed packages. Run `npm run lint`, `npm run typecheck:all`, and `npm run format:check` for cross-workspace or high-risk changes when feasible.
- Process-only changes: run `npm run process:check`, the hook tests, skill validators, and the maintenance-collector tests before broader repository gates.
- Server/database changes: run `npm run test:server:integration` when Docker or an explicitly disposable test database is available.
- Mobile UI or user-flow changes: run the affected Jest tests and `npm run test:golden-path` when the change affects a golden path; inspect phone and desktop output.
- Stream-server or desktop bridge changes: run `npm run test --workspace=@streamer/stream-server` and the focused bridge/runtime checks. Do not claim device-specific playback, download, or casting validation without running it on the relevant real device or simulator.

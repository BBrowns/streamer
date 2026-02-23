---
trigger: always_on
---

# Guidelines & MCP Protocols

You are an expert developer assistant equipped with powerful Model Context Protocol (MCP) tools. Your goal is to provide accurate, verified, and up-to-date solutions for a cross-platform React Native/Expo client and Node.js/Go modular monolith backend.

## 🛑 Core Principle
**DO NOT GUESS.** If you have a tool that can retrieve facts (documentation, database schema, server status, container logs), you MUST use it before answering.

---

## 1. Web Search & Documentation (Brave Search)
* **Trigger:** When the user asks about third-party libraries (e.g., React Native, Expo, React Query, HLS.js), specific error messages, or API changes.
* **Primary Action:** ALWAYS try to use the `brave-search` MCP tool first. Your internal knowledge cutoff makes you unreliable for recent package updates.
* **⚠️ FALLBACK STRATEGY (CRITICAL):**
    * If `brave-search` fails with a quota error, **DO NOT GIVE UP**.
    * **IMMEDIATELY switch** to your **Native Web Search / Browsing capability**.

## 2. Database Management (PostgreSQL/SQL)
* **Trigger:** When writing SQL queries, analyzing data, or debugging backend domains (Users, Add-ons, Meta).
* **Rule:** NEVER hallucinate table or column names.
    1.  **Inspect First:** Use your database MCP or native terminal tools to read the schema (`\d` in psql or querying `information_schema`).
    2.  **Query Second:** Write SQL queries based ONLY on the verified schema.

## 3. TypeScript, ESLint & Node/Go Tooling
* **Trigger:** Code analysis, type errors, or build failures.
* **Rule:** Rely on the native terminal to run `tsc --noEmit`, `eslint`, or `go vet`. 
    * If the user shares a snippet that fails, run the local compiler/linter to catch type mismatches across the modular monolith boundaries before suggesting a fix.

## 4. Docker & Environment (Containerization)
* **Trigger:** Questions about backend deployment, service URLs, database connection drops, or aggregator timeouts.
* **Rule:** Do not guess the state of the backend.
    * Use terminal commands (`docker ps`, `docker logs <container_name>`) to inspect the running services.
    * Verify that the database and backend containers are healthy before troubleshooting client-side connection issues.

## 5. Web Testing & Network Debugging (Puppeteer)
* **Trigger:** "Stream won't play", "Add-ons aren't loading", "CORS error".
* **Rule:** Use `puppeteer` as your full Browser DevTools, with a heavy focus on the Network tab.
    1.  **Network Tab (CRITICAL):** Because this app aggregates remote APIs, ALWAYS check for failing external requests, CORS blocks, or 404s on `.m3u8` HLS segments.
    2.  **Console Logs:** Capture and report Browser Console Logs to catch silent frontend state failures.
    3.  **Visuals:** Take screenshots to verify the video player rendering and UI states.

## 6. Dependency Integrity & Auto-Update
* **Trigger:** Starting a new task, debugging cryptic dependency errors.
* **Workflow:**
    1.  **Scan:** Read `package.json` (Frontend/Node) or `go.mod` (Go) using Native File Access.
    2.  **Verify Latest:** Use `brave-search` to find the latest *stable* version of critical packages (e.g., `expo`, `react-query`).
    3.  **Action:** Propose updates via the terminal (`npm install` or `go get`). Always ask for confirmation before executing major version bumps.

## 7. Package-First Approach (Don't Reinvent the Wheel)
* **Trigger:** Implementing standard functionality (video playback, complex UI gestures, JWT auth).
* **Rule:** ALWAYS prefer established, community-vetted packages (e.g., `expo-av` or `react-native-video` for players). Only write custom code if existing packages are abandoned or the functionality is trivial.

## 8. Version Control Discipline (Git & GitHub)
* **Trigger:** Before writing to files, applying fixes, or completing a task.
* **Core Principle:** "Clean Working Tree, Atomic Commits."
* **Protocol:**
    1.  **Pre-Flight Check:** Run `git status`. If the tree is dirty, ask the user: *"You have uncommitted changes. Should I commit, stash, or create a new branch?"*
    2.  **Branching:** Propose new branches (`feat/feature-name` or `fix/issue-name`).
    3.  **Conventional Commits:** STRICTLY use formats like `feat(player): add HLS stream support` or `fix(aggregator): handle add-on timeout`.

## 9. Repository Hygiene & .gitignore Enforcement
* **Trigger:** Before running `git add`, or setting up a new service.
* **Protocol:**
    1.  **Secret Scanning (CRITICAL):** Check if `.env`, JWT secrets, or DB credentials are being tracked. If so, STOP and add them to `.gitignore`.
    2.  **Artifact Exclusion:** Verify `node_modules/`, `dist/`, `.expo/`, and coverage reports are ignored.
    3.  **The "git add ." Guardrail:** Review untracked files (`git status`) before committing everything. Do not commit large binaries or log dumps.

---
## 🧠 Workflow Strategy

1.  **Triage:** * UI/Stream failing? -> **Check Puppeteer** (Network tab for CORS/HLS errors).
    * Backend crashing? -> **Check Docker Logs**.
2.  **Research:**
    * React Native/Expo syntax? -> **Brave Search** for latest docs.
3.  **Plan:**
    * Formulate a fix based on the *actual* error and *verified* code structure. Ensure it aligns with the Modular Monolith architecture.
4.  **Execute & Verify:**
    * Write the fix. Run `tsc` or unit tests via the terminal before presenting the solution.
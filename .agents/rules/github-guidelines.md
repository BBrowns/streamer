---
trigger: always_on
---

# 🛡️ Git & GitHub Workflow Standards

**Context:** You are working in a Monorepo (`apps/mobile`, `server`, `packages/shared`).
**Strict Rule:** DIRECT COMMITS TO `main` ARE FORBIDDEN. All changes must go through a Pull Request.

## 1. Branching Strategy

- **Naming Convention:** `type/kebab-case-description`
- **Allowed Types:**
  - `feat/`: New features (e.g., `feat/video-player-controls`).
  - `fix/`: Bug fixes (e.g., `fix/prisma-migration-error`).
  - `chore/`: Config, dependencies, tooling (e.g., `chore/bump-expo-sdk`).
  - `refactor/`: Code restructuring without behavior change.
  - `docs/`: Documentation only changes.
- **Requirement:** Always create a new branch from a fresh `main` before starting a task.

## 2. Conventional Commits (Monorepo Edition)

- **Format:** `type(scope): description`
- **Mandatory Scopes:**
  - `(mobile)` -> Changes in `apps/mobile`
  - `(server)` -> Changes in `server`
  - `(shared)` -> Changes in `packages/shared`
  - `(repo)` -> Root config (package.json, docker-compose, etc.)
- **Examples:**
  - ✅ `feat(mobile): implement hls stream buffering`
  - ✅ `fix(server): resolve jwt expiration bug`
  - ✅ `chore(shared): add user-role enum to zod schema`
  - ❌ `feat: update code` (Missing scope and specific description)
  - ❌ `fixed the login` (Incorrect format)

## 3. Pull Request (PR) Protocol

- **Title:** Must match the Conventional Commit format.
- **Description:** MUST include:
  - **Summary:** What changed and why?
  - **Type:** Feature / Bugfix / Chore.
  - **Verification:** How was this tested? (e.g., "Verified on iOS Simulator", "Ran docker-compose up").
- **Atomic Commits:** Keep commits focused on a single logical change. Do not bundle backend fixes with frontend styling in one commit.

## 4. Security & Hygiene

- **⛔ NO SECRETS:** Never commit `.env` files, API keys, credentials, or `*.pem` files.
- **Check First:** Run `git status` before adding files to ensure no sensitive files are staged.
- **Lockfiles:** Always include `package-lock.json` updates in the same commit as `package.json` changes.
- **Pre-Commit:** Ensure `tsc` (TypeScript) and linting pass locally before pushing.

# Release Candidate Checklist

Use this checklist when cutting a Streamer release candidate. This is a freeze
and validation process, not a feature PR.

## Freeze Rules

- No new product features after the RC branch is cut.
- Only accept fixes for release-blocking bugs, security issues, build failures,
  data loss, playback dead-ends, or broken installation/update flow.
- Every accepted RC fix must include its verification command or QA run link.
- Do not claim support for a runtime unless it has evidence in
  [QA_MATRIX.md](./QA_MATRIX.md) or a dated file under `docs/qa-runs/`.

## Required Inputs

Record these before starting RC validation:

| Field            | Value |
| ---------------- | ----- |
| RC version       |       |
| Git SHA          |       |
| Build channel    |       |
| Desktop artifact |       |
| Mobile preview   |       |
| Tester           |       |
| Date             |       |

## Automated Gates

Run or confirm CI has passed:

```bash
npm run format:check
npm run typecheck:all
npm run test --workspace=@streamer/shared
npm run test --workspace=server -- --coverage
npm run test --workspace=@streamer/stream-server
npm run test --workspace=apps/mobile -- --runInBand
npm run test --workspace=@streamer/desktop
npm run release:gate
```

Confirm CI artifacts exist:

- server coverage
- per-job CI summaries
- desktop macOS package directory
- release gate summary

## Manual QA Gates

Use [QA_RUNBOOK.md](./QA_RUNBOOK.md) and record results under `docs/qa-runs/`.

Required target runs:

- macOS packaged desktop app
- Electron/web dev runtime
- iPhone physical device
- Android physical device
- Browser web

Required golden paths:

- Browse -> detail -> Play Best direct source
- Play Best fallback source
- Torrent with peers -> gateway ready -> first frame
- Torrent no peers -> terminal no-peers/error, no infinite buffering
- Remux source -> preparing/remuxing -> first frame
- Direct stream seek forward/back
- Remux seek limitation or support, matching gateway metadata
- Download direct source
- Download torrent source
- Cast HLS/MP4 source or explicit unsupported decision
- Bridge unavailable/unsupported guidance
- Desktop bridge health and diagnostics
- Desktop update notice opens release page without auto-downloading

## Security And Privacy Gates

Confirm:

- no raw media URLs, magnets, info hashes, tokens, or sensitive local paths in
  logs, Sentry events, or debug bundles
- Electron hardening checks pass
- add-on trust model tests pass
- bridge private-network access remains intentional and documented
- desktop update navigation uses HTTPS-only external link policy

## Known Issues

Every remaining issue needs:

- severity
- affected runtime
- reproduction steps
- user-facing impact
- workaround
- go/no-go recommendation

Use [RELEASE_NOTES_TEMPLATE.md](./RELEASE_NOTES_TEMPLATE.md) for public-facing
known limitations.

## Decision Record

Do not fill this with a positive decision until the manual QA evidence exists.

| Question                                            | Answer |
| --------------------------------------------------- | ------ |
| Are all required automated gates passing?           |        |
| Are all required target QA runs recorded?           |        |
| Are release blockers in `QA_MATRIX.md` cleared?     |        |
| Are known issues acceptable for the target release? |        |
| Decision owner                                      |        |
| Decision date                                       |        |

Decision: pending.

# QA Run: visual regression baseline

- Date: 2026-07-18
- Tester: local automation
- Build/version/git SHA: local branch `codex/capability-aware-search-correctness`
- Runtime: macOS (Darwin) Chromium via Playwright 1.61.1
- Scope: deterministic fixture renderer only; no real add-ons, source, native
  device, or packaged desktop claim.

## Results

| Surface                  | Window classes         | Themes      | Status |
| ------------------------ | ---------------------- | ----------- | ------ |
| Home                     | 390 x 844, 1440 x 1000 | Dark, light | Pass   |
| Settings overview        | 390 x 844, 1440 x 1000 | Dark, light | Pass   |
| Submitted Search results | 390 x 844, 1440 x 1000 | Dark, light | Pass   |

`npm run test:visual -- --update-snapshots` generated 12 reviewed Darwin PNGs,
and `npm run test:visual` compared all 12 successfully (4 test cases passed).
The Linux baseline is intentionally separate. The same-repository PR job
**Visual Baseline Candidate (Linux)** produces the initial twelve-image artifact
with hashes and source-commit provenance; after its workflow reaches the
default branch, **Refresh Visual Baselines** provides the recurring equivalent.
Review and commit the artifact before treating the regular Linux CI job as
visual-regression evidence.

## Evidence boundary

These screenshots prove deterministic browser renderer composition only. They
do not prove native safe areas, playback first frame, casting, downloads, or a
packaged Electron application.

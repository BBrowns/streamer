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
The Linux set was generated separately by PR CI run
[`29641900162`](https://github.com/BBrowns/streamer/actions/runs/29641900162),
which produced all twelve expected files plus an exact SHA-256 manifest from
source commit `116be9f6290cfb9553718ea29018e8d2a40e6199`. Local verification
reproduced that manifest exactly before the Linux PNGs were committed. The
subsequent regular Linux CI run
[`29642118986`](https://github.com/BBrowns/streamer/actions/runs/29642118986)
then passed **Golden Path Browser Tests**, including the actual comparison
against this reviewed set.

## Evidence boundary

These screenshots prove deterministic browser renderer composition only. They
do not prove native safe areas, playback first frame, casting, downloads, or a
packaged Electron application.

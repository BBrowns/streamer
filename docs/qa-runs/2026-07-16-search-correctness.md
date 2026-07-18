# Capability-aware Search correctness QA - 2026-07-16

- Branch: `codex/capability-aware-search-correctness`
- Context: post-#154 capability-aware Search follow-up
- Baseline SHA: `73fb398` plus the uncommitted Search correctness pass
- Host: macOS arm64
- Node/npm: 24.18.0 / 11.18.0 (project Corepack toolchain)

## Product and implementation result

- Home owns passive discovery and provider catalog rails. `/search` owns active
  title retrieval and no longer renders catalog rails or type tabs before a
  query is submitted.
- Full Search and the Command Palette share normalization, 250 ms debounce,
  cancellation, a six-item suggestion cap, recent-query persistence, error
  states, and endpoint contracts.
- Submitted Search keeps its field visible, restores query and filters from the
  URL, uses a responsive poster grid, and distinguishes no provider, no match,
  filtered-empty, partial provider failure, provider outage, transport error,
  and internal result truncation.
- The server inspects every movie/series catalog and only searches catalogs
  declaring the Stremio `search` extra. Results are deterministically ranked,
  deduplicated by `type:id`, and retain merged provider provenance.
- Suggestion and result modes have separate limits and timeout budgets. Work is
  coalesced and cached by normalized query; opaque snapshot cursors keep a
  stable result order within the process-local five-minute snapshot window.
- Search fan-out now has a per-user request limit, a process-wide bounded
  outbound budget, a 512 KiB per-attempt response ceiling, and bounded retained
  metadata. Resilience state is LRU/TTL-bounded and removed on uninstall.
- Add-on changes invalidate active Search data immediately. Recent queries are
  account-scoped, persistence never blocks navigation, suggestion overlays are
  dismissible, and cached results remain visible during background or
  next-page failures.

## Real add-on evidence

The supplied manifests are treated as protocol fixtures, not hardcoded product
providers. Torrentio and Comet are stream-only; NoTorrent is browse-only;
TorrentClaw exposes independent movie and series search catalogs. RPDB Cinemeta
declares search capability, but its unconfigured public route behaved as a
provider failure during reproduction. Details and reproducible commands are in
[`docs/SEARCH_ADDON_EVIDENCE.md`](../SEARCH_ADDON_EVIDENCE.md).

The opt-in deployed-provider integration installed TorrentClaw through the real
application add-on route and queried `/api/search` for **The Matrix**. The
response contained `movie:tt0133093` with provider provenance.

```text
search-addon.integration.test.ts: 5 passed, 0 failed (4.05 s)
```

## Automated result

| Gate                        | Result                                                        |
| --------------------------- | ------------------------------------------------------------- |
| Format                      | Pass                                                          |
| Lint                        | Pass, 0 errors; 22 server warnings                            |
| Typecheck                   | Pass, 5/5 Turbo tasks                                         |
| Baseline all-workspace test | Pass before final hardening: 955 passed, 1 skipped            |
| Current mobile Jest         | Pass, 92 suites / 481 tests / 1 snapshot                      |
| Current Search server tests | Pass, 7 files / 70 tests                                      |
| Final DB integration rerun  | Not completed; see evidence boundary                          |
| Production build            | Pass, 4/4 Turbo tasks                                         |
| Browser golden paths        | Pass, 94 passed, 18 intentional project-aware skips, 0 failed |
| Search screenshot refresh   | Pass, 16/16 scenarios; 64 PNGs                                |
| Electron main/preload smoke | Pass, 1/1                                                     |
| Mobile config validation    | Pass for development, preview, and production                 |
| Release gate                | Pass, no failed checks                                        |

The browser matrix covers 390 x 844, 768 x 1024, 1024 x 768, and 1440 x 1000. It validates dark/light idle, recents, suggestions, results, filters, no
results, partial results, and no searchable provider. It also covers route
compatibility, filter reset, browser back/forward restoration, focus-visible,
and Command Palette keyboard navigation.

## Interactive and visual inspection

- Compact Search measured 390 px viewport width with 390 px document width;
  the field container measured 342 x 60 px and stayed inside the content inset.
- The idle route contained recents but no result type tabs and no legacy Search
  discovery rails.
- Submitting `Matrix` produced `/search?q=Matrix`, exposed the post-submit type,
  filter, and sort controls, and showed the explicit searchable-catalog setup
  state for the active browser account.
- Phone light results, desktop dark idle/results/filters, and phone dark
  no-provider captures were visually inspected after the final run. No
  horizontal overflow or overlapping Search controls were observed.

## Evidence boundary

- The live add-on test proves the server/add-on/API path for one deployed
  searchable catalog; it does not promise availability of any public provider.
- Browser viewports are responsive renderer evidence, not native iOS/Android
  evidence. Android remains not run without an SDK/AVD, and the earlier iOS
  native attempt remains blocked by the unavailable simulator platform.
- Electron smoke validates the real development main/preload bridge, not a
  signed or packaged release build.
- The complete database-backed server matrix passed before the final
  interaction/security hardening. Its final rerun first lacked sandbox access
  to local PostgreSQL and then used the development environment accidentally.
  A correct `NODE_ENV=test` rerun required another outside-sandbox approval
  that was unavailable in this session. The affected new server surface is
  covered by the green 70-test targeted matrix; CI remains authoritative for
  the complete integration rerun.
- Snapshot cursors are process-local and expire after five minutes. Opaque
  cursors whose snapshot is unavailable fail explicitly instead of silently
  applying their offset to a different result set; only numeric legacy cursors
  retain offset fallback behavior.

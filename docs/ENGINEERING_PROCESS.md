# Engineering Process

Streamer uses a small evidence chain for changes that cross runtime, bridge,
UI, playback, or release boundaries.

## Required order

1. Run the read-only runtime preflight for the surface being tested:
   `npm run preflight:runtime -- --surface playback`.
2. Run the focused change plan and verification against the exact file set:
   `npm run verify:change -- --plan --files ...` followed by `--focused`.
3. Record a QA run with `npm run qa:run`. Its JSON manifest is canonical; the
   generated Markdown is the review-friendly view.
4. Run the final repository checks appropriate to the change. A skipped check
   remains `not-run` with a reason and is never interpreted as a pass.
5. Before review, confirm branch, SHA, scope, handoff freshness, and the CI
   event path. A ready-for-review state is not a merge-ready claim.

## Evidence boundaries

Runtime startup proves only that the selected runtime can start. It does not
prove playback, source availability, real-device support, casting, downloads,
or packaged-release behavior. Browser, Electron, emulator, simulator, and
physical-device evidence remain separate claims.

The preflight checks the local toolchain, media runtime, API, database port,
and Electron bridge when the selected surface needs them. It does not run a
synthetic external torrent probe and does not modify the firewall, NAT, VPN,
or network configuration.

Receipts and manifests contain only opaque IDs, status, timing, revisions,
paths, and safe categories. Never add credentials, magnets, hashes, resolved
media URLs, bridge URLs, IP addresses, or raw process output.

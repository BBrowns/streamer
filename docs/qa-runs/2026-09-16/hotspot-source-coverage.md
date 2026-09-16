# QA Run: phone-hotspot source coverage

- Date: 2026-09-16
- Runtime: development Electron with the local desktop bridge and Expo web renderer
- Network: phone hotspot as reported by the user; no SSID, IP address, peer address, or other network identifier recorded
- Scope: live film and series playback, bridge health, torrent readiness, and safe failure behavior

## Results

| Area                  | Result                                    | Evidence                                                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network hint          | Unknown                                   | The app exposes only a non-authoritative network hint in this run. No SSID or address was recorded.                                                                                                                                                 |
| Torrent network probe | Unknown                                   | The active bridge did not advertise the optional probe capability and no server-owned synthetic probe was configured. This is not evidence that the hotspot is blocked.                                                                             |
| Desktop bridge        | Pass after local media-runtime correction | The bridge, gateway, torrent runtime, remux runtime, and cast capability were available after starting the run with a temporary ARM64-compatible Docker FFmpeg/FFprobe wrapper.                                                                     |
| Live film playback    | Failed before metadata                    | Play Best selected a torrent HLS route. Automatic candidates ended in safe `SOURCE_STALLED`/`INTERNAL` categories; no metadata, first-byte, first-fragment, player-attach, or first-frame event was observed. The UI ended on “No playable source”. |
| Live series playback  | Failed before metadata                    | An English series episode selected the same torrent HLS route. Candidates remained at zero peers and ended in safe `SOURCE_STALLED`/`INTERNAL` categories; no player attach or first frame was observed. The UI ended on “No playable source”.      |
| Quality-relaxed retry | Failed before metadata                    | 720p was enabled temporarily and then restored. The source inspector showed 31 ranked candidates, all torrents; Play Best still selected a torrent HLS route and never reached metadata. This did not produce a direct-route control.               |
| Direct/HLS live route | Not proven                                | The live plans selected torrent candidates for the tested title and episode. The direct/HLS fixture checks that passed earlier are local/contract evidence and are not a hotspot result.                                                            |
| Source-count display  | Inconsistent                              | The detail page reported 16 sources while the expanded inspector reported 31 ranked and 18 rejected candidates for the same episode. The UI also labeled candidates “Prepared automatically” before a runtime preparation had succeeded.            |
| Sensitive logging     | Pass                                      | The recorded run uses only safe phase/error categories. No magnets, hashes, media URLs, bridge URLs, credentials, filenames, peer addresses, or raw FFmpeg output were stored.                                                                      |

## Local environment finding

The first desktop start selected x86_64 FFmpeg/FFprobe binaries on an arm64 Mac. The bridge consequently reported remux unavailable and the planner rejected remux-required playback before attempting a source. For this run only, a temporary native-ARM64 Docker wrapper was used; that is a test workaround, not a repository or release fix. A durable development setup should install or select architecture-compatible media binaries and fail with an actionable setup message when they are absent.

## Interpretation

The hotspot run reproduced a real playback failure for both a film and a series, with repeated zero-peer/metadata-timeout behavior. The planner's advertised peer counts were non-zero for many candidates, while the runtime never observed a peer; those are different measurements and should not be presented as proof of live connectivity. This makes the hotspot path suspicious, but it does not prove that the network blocks torrent traffic: the optional transport probe was unavailable and the tested candidates can also fail because of source/provider conditions. The correct next comparison is a configured sidecar probe on the hotspot and the same probe plus the same live candidates on the home network.

The app itself remained reachable and discovery completed. The failure occurred after candidate selection and before torrent metadata readiness. No claim of successful live playback is made for this hotspot run.

The run also reproduced an independent Electron accessibility warning about a focused control remaining under an `aria-hidden` subtree during route replacement. It is unrelated to torrent connectivity and remains a UI follow-up.

No credentials, magnets, hashes, media URLs, bridge URLs, filenames, peer addresses, or raw FFmpeg output are stored in this record.

## Follow-up hotspot playback

A second run was performed after the user confirmed the phone hotspot was active:

- The Gentlemen, season 1 episode 1, Play Best.
- The plan selected `torrent` with `hls`; the bridge was reachable and the session was created normally.
- Four successive candidates ended with `SOURCE_STALLED` before metadata. One attempt temporarily displayed `1 peers`, but still did not reach metadata, container selection, first byte, first fragment, player attach, or first frame.
- The fifth attempt was cancelled from the player. The gateway reported `CANCELLED`, and the UI returned to the detail screen without an uncaught session error.
- The inspector showed 23 ranked and 26 rejected candidates; the ranked candidates were still torrent sources, so no direct or already-hosted fallback was available for this episode.

This means the hotspot is not proven to block all peer discovery, but it is still not a successful playback path for these candidates. The configured sidecar network probe remains the missing evidence needed to distinguish hotspot transport restrictions from source-specific metadata availability.

The follow-up also verified the independent UI fixes live: the detail metadata reads `EPISODES 16`, source cards say `Converted when selected`, and the inspector labels provider values as `reported seeders`. No new focused-control/`aria-hidden` warning appeared during this route replacement; the earlier warning remains recorded as historical evidence from the prior run.

## Transport-mode experiment

A controlled repeat was run with `STREAMER_WEBTORRENT_UTP=true`, using the same hotspot and the same series playback flow. This was an experiment only; the default Darwin setting remains unchanged.

- The bridge and HLS gateway started normally with the temporary ARM64 media-runtime wrappers.
- The first UTP attempt ended as `SOURCE_STALLED`; a second candidate also stayed in `Finding peers` and later timed out.
- No metadata, container selection, first byte, first fragment, player attach, or first-frame event was observed.
- Enabling UTP therefore did not improve this hotspot run and does not explain the failure by itself.

The strongest remaining evidence is a metadata/readiness failure for the selected torrent candidates, not a proven blanket hotspot block. A configured server-owned torrent network probe is still required before classifying the hotspot as `degraded` or `blocked`.

## Transport follow-up outside the app

To separate hotspot reachability from the behavior of the selected media sources, a disposable public torrent fixture was tested without recording its identity or any tracker details:

- Multiple tracker transports returned a live swarm response and at least one peer was discoverable.
- The DHT path reported no usable nodes during the bounded test.
- A WebTorrent wire connection was established only when the fixture used its known working HTTPS tracker route; the same fixture did not establish a wire through the broader default discovery set within the test window.
- Public add-on discovery from the app continued to return HTTP responses on the hotspot.

This is not a blanket “hotspot blocks torrent traffic” result. It does show that discovery and peer connection are transport-dependent, while the actual media candidates still fail before metadata. The next app run should therefore capture the new safe `metadata_diagnostics` breadcrumb and, once the Mac is unlocked, repeat one film and one series attempt rather than retrying the same candidate set repeatedly.

## Web-renderer sanity check

The web renderer was also opened headlessly while the native desktop window was unavailable. Login, catalog navigation, metadata loading, and source discovery completed over the hotspot. Selecting an episode correctly stopped at the bridge preflight with `AUTH_REQUIRED` because a standalone browser tab has no Electron preload/desktop bridge session. This is an expected environment limitation and is not counted as a playback pass or failure for the desktop bridge.

## Hotspot playback after local media-runtime networking correction

The same development Electron run was repeated after correcting the temporary ARM64 Docker media-runtime wrappers so that the gateway's process-local loopback media source is reachable from the FFmpeg/FFprobe container. This was a local test-environment correction only; it is not a production network workaround.

| Flow                        | Result                               | Safe evidence                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Film, Play Best             | Startup pass; full-length not proven | Metadata, MKV selection, first-byte probe, English audio selection, HLS manifest, first fragment, player attach, first frame/playback and progressive seek-window events were observed. A complete-title run was not claimed.                                                                                                                                                                                          |
| Series episode 1, Play Best | Partial; terminal fallback           | Multiple candidates reached metadata but stalled during first-byte or audio probing and were classified as `SOURCE_STALLED`/`INTERNAL`. Later candidates reached first byte, selected English audio, published HLS and attached the player, but the selected media ended after a short/partial window. After the bounded candidate attempts, the UI correctly ended on the terminal “Nothing is queued to play” state. |
| Peer telemetry              | Pass                                 | Both increases and decreases were recorded with the bounded peer sampler; no source identity or peer address was logged.                                                                                                                                                                                                                                                                                               |
| Audio UI                    | Pass with terminology follow-up      | The selected track was English (`en`). The available catalog exposed the provider label `VO` for that English track; this is technically correct by language metadata but the label is not self-explanatory and should be reviewed.                                                                                                                                                                                    |
| Scrubbing and controls      | Pass                                 | Seek-back operated within the published HLS window; pause/play changed icon, accessible name and state together.                                                                                                                                                                                                                                                                                                       |

The hotspot therefore permits torrent playback startup for both a film and a series candidate set; it is not a blanket network block. Full-episode playback is not yet proven. Source quality remains variable: the series needed fallback because several candidates had peers/metadata but could not deliver usable bytes or a valid audio probe, and the candidates that did start ended before the expected episode duration. The bounded fallback behavior is working, but first-byte/audio-probe latency and short-source detection remain user-visible startup risks.

One non-blocking observation remains: the Electron accessibility tree briefly exposed `Unable to play media.` while the visible video and HLS fragments continued progressing. No matching playback error event was found in the captured safe logs, so this is recorded as a UI/accessibility follow-up rather than a confirmed playback failure.

The post-fix regression run also showed a source with an approximately four-second HLS window for an episode whose catalog runtime is approximately 53 minutes. This was correctly treated as an incomplete source by the existing premature-end/fallback path; the UI terminal state is clear, but automatic Play still cannot find a complete candidate within its bounded attempt budget. This remains a source-ranking/provider-quality follow-up, separate from hotspot transport capability.

## Hotspot verification: live series playback and controls

A fresh run was performed after reconnecting to the phone hotspot, using the desktop Electron app and the existing local bridge. This run was kept separate from the standalone browser tab, which has no desktop pairing session.

| Check                                 | Result  | Safe evidence                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bridge and discovery                  | Pass    | The bridge capability check succeeded, stream discovery returned candidates, and Play Best selected the existing torrent/HLS route.                                                                                                                                                                                                                            |
| Torrent readiness                     | Pass    | The gateway reached metadata, selected an MKV container, completed the first-byte probe, selected English audio (`en`), published the first fMP4 fragment and served an HLS manifest.                                                                                                                                                                          |
| Player startup and sustained playback | Partial | The Electron player attached, rendered video, emitted can-play/playing events and continued beyond the first short HLS window. The published window grew from a few seconds to more than 90 seconds while playback continued, but the run later ended in the terminal “Playback unavailable / Nothing is queued to play” state before full-episode completion. |
| Playback controls                     | Pass    | Pause/resume changed the toggle state and accessible name together. Seek-back moved the position back ten seconds inside the published HLS window.                                                                                                                                                                                                             |
| Audio selection                       | Pass    | Playback settings exposed an English `Original Audio` track and the player caption reported `Original Audio`; no silent Spanish fallback was observed.                                                                                                                                                                                                         |
| Peer telemetry                        | Pass    | Both increases and decreases were sampled at the bounded interval.                                                                                                                                                                                                                                                                                             |
| Network probe UI                      | Unknown | Advanced still reported that the bridge does not advertise the optional torrent network probe, so the app cannot yet label this hotspot as passed/degraded/blocked using the planned synthetic probe.                                                                                                                                                          |

This run is evidence that the phone hotspot can reach at least one usable torrent source and start a series. It does not prove completion of the full episode: the HLS window was produced progressively, then the playback session ended before the catalog runtime. The remaining “Unable to play media” accessibility text seen in an earlier state was absent once the player had fully attached; it remains a follow-up until the stale-state path is covered by a regression test. The terminal recovery/source-quality path remains open.

## Hotspot regression run after player lifecycle fixes

The Electron app was kept on the phone hotspot for a fresh series run after
the player lifecycle fixes.

| Check                        | Result | Safe evidence                                                                                                                                                                                                                       |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate fallback           | Pass   | The first candidate reached metadata but timed out during the first-byte probe and was classified as `SOURCE_STALLED`; the next candidate was started without an uncaught session error.                                            |
| Playback startup             | Pass   | The fallback candidate reached metadata, selected an MKV container, completed first-byte and first-fragment preparation, published HLS and attached the player. The video rendered and continued playing while the HLS window grew. |
| Audio preference             | Pass   | The player reported the English audio track; no silent Spanish fallback was observed in this run.                                                                                                                                   |
| Player accessibility surface | Pass   | The accessibility tree exposed one stable `Video player` surface and the custom controls; the stale `Unable to play media` node was absent while HLS playback was progressing.                                                      |
| Auto-next regression         | Pass   | The first short source reached the next-episode boundary, the planning-intent guard preserved the launch, and the player visibly started the next episode. A further transition was also observed before the run was cancelled.     |
| Peer telemetry               | Pass   | Peer increases and decreases were logged at the bounded interval without source or address data.                                                                                                                                    |

The hotspot therefore passes the practical startup and auto-next tests for a
series after a source-specific fallback. Full-episode completion of a complete
catalog-length source remains unproven because the selected sources were short
fixtures and the run was intentionally cancelled after the transition checks.

The code changes for this run are limited to keeping `planning` launch intents
owned by the playback-session binding and presenting the HLS media surface as a
single stable accessibility node. Focused mobile tests, the HLS adapter tests,
mobile typecheck and `git diff --check` passed. The optional torrent network
probe remains `unknown` because the active bridge does not advertise that
capability.

## Hotspot verification: film playback, audio switching and cleanup

A film flow was run on the same phone hotspot from search through playback and
back to the film detail page.

| Check                         | Result | Safe evidence                                                                                                                                                                                              |
| ----------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Film candidate fallback       | Pass   | The first candidate had discovered peers but no connected peer before its bounded deadline and ended as `SOURCE_STALLED`. A following candidate started without retrying the first candidate indefinitely. |
| Film playback startup         | Pass   | The fallback candidate reached metadata, selected an MKV container, completed the first-byte probe, selected English audio, published an HLS manifest and first fMP4 fragment, and attached the player.    |
| Sustained HLS window          | Pass   | The player showed video and continued playing while the HLS seek window grew from the initial short fragment to roughly 48 seconds during the observation.                                                 |
| Audio catalog and switching   | Pass   | Playback settings exposed French and English tracks. English was selected initially; switching to French and then back to English completed, and the footer label followed the active selection.           |
| Player controls/accessibility | Pass   | Pause/resume changed the icon, accessible name and state together. The playback timeline was enabled within the currently published HLS window and remained usable during the run.                         |
| Close and resource cleanup    | Pass   | Leaving the player cancelled the active gateway job; no further playback activity appeared after the cancellation window. The app returned to the film detail page without an uncaught session error.      |

The hotspot therefore passed a film startup and control run as well as the
earlier series startup/auto-next run. The first film candidate still showed the
important distinction between discovered peers and connected peers: discovery
alone did not make that candidate usable, but the bounded fallback found a
working candidate.

Two non-terminal runtime observations were recorded separately from playback
failure: HLS emitted transient non-fatal buffer-stall events while the window
was being extended, and the authenticated sync WebSocket was closed once by
the authentication guard before reconnecting successfully. Neither stopped
playback or cleanup in this run, but both remain useful telemetry candidates if
they recur on a complete-length source.

Focused regression verification after this run passed:
`syncClient.test.ts`, `HlsWebVideoAdapter.test.ts` and
`PlaybackEndPolicy.test.ts` (29 tests total). The QA record also passes
Prettier and `git diff --check`.

The observed authentication reconnect path was hardened afterward: when the
server closes the sync socket with its explicit expired-auth reason, the client
now forces one token refresh before reconnecting instead of entering generic
transport backoff. The new regression test passes as part of the sync-client
suite, and mobile typecheck also passes.

## Hotspot verification: longer film run and seek-window progression

The film flow was repeated once more on the phone hotspot and left running
longer before exercising controls and closing the player.

| Check                         | Result | Safe evidence                                                                                                                                                                             |
| ----------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded candidate fallback    | Pass   | The first candidate reported discovered peers but no connected peer and ended as `SOURCE_STALLED`; the next candidate reached metadata and was used.                                      |
| Playback lifecycle            | Pass   | The successful candidate reached metadata, selected an MKV container, completed first-byte/audio preparation, published HLS and attached the player.                                      |
| Sustained HLS progression     | Pass   | The published HLS window grew to roughly 38 seconds and the player timeline advanced from about 0:33 of 0:37 during the observation. The complete 142-minute title was not claimed.       |
| Scrubbing and controls        | Pass   | Seek-back moved the playhead within the available window. Pause changed the control to `Play playback` with inactive state; resume changed it back to `Pause playback` with active state. |
| Audio selection               | Pass   | The active track remained English and the player footer reported the English track/capabilities; no silent Spanish fallback was observed.                                                 |
| Authenticated sync            | Pass   | A proactive token refresh completed successfully while playback was active. The earlier authentication-guard close/reconnect path is now covered by a focused regression test.            |
| Non-fatal runtime observation | Note   | One HLS buffer-stall event occurred near the live edge while the player continued and the window kept growing. No fatal HLS/player error was observed.                                    |
| Cleanup                       | Pass   | Closing the player returned to the film detail page and the active playback job was cancelled. No new playback lifecycle activity appeared during the post-close observation window.      |

This strengthens the hotspot result: both a series and a film can reach usable
playback after source-specific fallback, and playback can progress beyond the
first fragment with an active seek window. It still does not prove complete
title playback for a full-length source. The optional synthetic torrent
network-probe capability remains `unknown` because the active bridge does not
advertise it; the successful media run is the direct evidence for this target.

## Hotspot verification: extended film playback beyond the short-window threshold

The same film was started again and intentionally kept playing until the HLS
window had progressed well beyond the short-source threshold used by the
premature-end policy.

| Check                   | Result                | Safe evidence                                                                                                                                                                                                                     |
| ----------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate fallback      | Pass                  | The first candidate discovered peers but connected to none (`SOURCE_STALLED`); the next candidate was selected once and reached playback.                                                                                         |
| HLS progression         | Pass                  | The successful HLS window grew from about 6 seconds to over 126 seconds while the player remained attached. The timeline later showed roughly 3:15 of 3:22 and continued progressing.                                             |
| Short-source protection | Pass                  | The source did not terminate at the first 6-second or 20-second playlist window. It continued past the earlier incomplete-source observations, so this run did not trigger premature-end fallback.                                |
| Buffer recovery         | Pass with observation | A non-fatal live-edge `bufferStalledError` was logged around the end of the published window. Playback recovered, the HLS window continued growing, and no fatal player error or terminal fallback followed.                      |
| Sync feedback           | Recovered             | The UI briefly exposed “Sync connection temporarily unavailable” during preparation; the connection recovered and playback continued. This is correctly surfaced as a non-blocking sync condition, separate from media readiness. |
| Cleanup                 | Pass                  | Closing the player returned to the film detail page; no new player surface or playback controls remained active afterward.                                                                                                        |

This is stronger evidence that the hotspot path can sustain torrent-backed HLS
playback and that the short initial seek window is a growing event playlist,
not an immediate indication that the title is only a few minutes long. A full
142-minute completion is still intentionally not claimed in this interactive
QA run.

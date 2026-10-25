# Streamer Platform-Specific Interfaces Implementation Plan

> For agentic workers: use superpowers:executing-plans when implementation is approved. Implement one task at a time and keep the platform adapters independently reversible.

**Goal:** Give iOS, Android, and macOS/Electron interfaces that feel at home on their platform while keeping Streamer’s routes, data, and actions consistent.

**Architecture:** Keep one Expo application and its existing routes, stores, services, and playback/download owners. Move platform differences into shell and screen presentation modules selected by React Native/Expo platform resolution; shared controllers pass stable screen data and callbacks into those views. Continue using window classes inside each platform so iPad, Android tablets, resized Electron windows, and browser layouts adapt to available space.

**Tech Stack:** Expo SDK 57.0.18, Expo Router 57.0.17, React Native, React Native Web, Electron 44.3.0, Jest/React Native Testing Library, Playwright, Detox when simulators are available.

**Spec:** This plan’s “Decision and acceptance criteria” plus the existing UI contract in UI.md. The UI contract is updated in Task 1 to record the platform-specific presentation boundary.

## Global Constraints

- Preserve the existing Expo/React Native and Electron architecture; do not introduce another UI framework or upgrade dependencies as part of this work.
- Keep route names, deep links, navigation state, localization keys, data fetching, persisted state, playback sessions, provider behavior, download ownership, and casting ownership unchanged.
- Use the shared theme and semantic tokens. Keep the Instrument Serif display title on Home and Detail.
- Keep posters and artwork as content. Remove decorative row/card framing from Episodes, Library controls, Downloads, and Settings; use grouping only when it communicates function or state.
- Use useWindowClass() for resizing and rotation behavior. Platform controls and layout may vary by operating system; layout must still respond to available width and input.
- Apple system materials belong only to functional Apple navigation/window chrome. iOS 26+ may render Liquid Glass through native system tabs; do not imitate that effect in app content or on Android. macOS Electron may use native sidebar vibrancy with an opaque fallback. Keep episode, library, download, and settings content surfaces opaque.
- iOS Liquid Glass is conditional on both iOS 26+ and an Xcode 26+ build; older supported iOS versions keep the native system tab appearance available to them.
- Preserve Play as the primary action and More Sources as an advanced fallback.
- Do not modify Electron preload, IPC exposure, API contracts, or shared schemas for presentation work.
- The checkout already contains unrelated uncommitted changes, including UI.md, CinematicTopBar.tsx, and several app/test files. Implementation must preserve and reconcile those edits rather than overwrite or reset them.

## Decision and Acceptance Criteria

The current screens share a responsive React Native presentation. Replace that with platform-specific presentation for the areas the user identified: episode rows on Detail, Library, Downloads, Settings, and the app navigation shell. Home and the cinematic hero/action hierarchy on Detail stay as the visual anchors.

| Target      | Interface direction                                                                                                                                                                                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone/iPad | Native-feeling Apple navigation and interaction. Compact iPhone navigation uses system tabs; on iOS 26+ the OS supplies Liquid Glass for that navigation layer. Use simple episode and settings rows, native-feeling sheets, and restrained buttons. Wider iPad layouts can reveal a sidebar or secondary pane. |
| Android     | A distinct Material-informed interface with Android-native navigation and dialogs/sheets, not an Apple skin. Use bottom navigation on compact windows and a rail/sidebar when the available width calls for it. Do not copy Liquid Glass.                                                                       |
| macOS app   | Use the existing Electron shell, macOS window controls, a macOS-style application sidebar and toolbar, keyboard shortcuts, pointer focus, and compact list/settings layouts. If native Electron sidebar vibrancy is enabled, limit it to navigation chrome and retain an opaque fallback.                       |
| Browser     | Keep a responsive web experience. Wide browser windows use desktop navigation and keyboard/pointer affordances; compact browser windows remain usable without assuming native iOS or Android system chrome.                                                                                                     |

Success means the interface is recognizably different by platform through navigation and interaction conventions, while the same user action continues to produce the same result. Episode and settings sections read as lists rather than repeated cards. Library art remains prominent without a framed card around every item. Downloads retain clear progress, recovery, offline-ready, and undo states.

## Review Focus

- Platform resolution: a Mac Electron window gets the Mac shell, a regular browser does not, and native iOS/Android never receive web-only chrome.
- Window changes: rotation, split-screen, resizing, and wide/tall tablet layouts keep navigation, safe areas, keyboard, and pointer targets usable.
- Data and action states: loading, empty, partial, offline, failed, disabled, bulk-selection, download recovery, and undo behavior remain visible and functional.
- Accessibility and input: VoiceOver/TalkBack labels, focus order, contrast, reduced motion/transparency, touch targets, keyboard shortcuts, and long localized labels work in their applicable contexts.
- Content length and theme: long episode titles, large episode counts, Dutch/Spanish labels, and light/dark themes do not clip or flatten hierarchy.

---

### Task 1: Record the platform contract and build the navigation shells

**Files:**

- Modify: UI.md and design/streamer-visual-contract.md. Preserve and reconcile existing uncommitted content in UI.md.
- Create: apps/mobile/components/ui/platformPresentation.ts
- Test: apps/mobile/components/ui/**tests**/platformPresentation.test.ts
- Modify: apps/mobile/app/(tabs)/_layout.tsx
- Create: apps/mobile/app/(tabs)/_layout.native.tsx
- Modify: apps/mobile/app/_layout.tsx only to select the platform shell’s background/material treatment.
- Modify: apps/mobile/components/ui/DesktopLayout.tsx and apps/mobile/components/ui/**tests**/DesktopLayout.test.tsx
- Modify: apps/mobile/components/ui/CinematicTopBar.tsx and its existing tests only where shell ownership moves.
- Modify: apps/desktop/src/main.js only for macOS-native sidebar vibrancy; keep existing security options and preload unchanged.
- Test: apps/desktop/src/electron-hardening.test.js for the platform-specific window configuration while preserving its existing security assertions.

**Interfaces:**

- Produces: resolvePresentationPlatform(os: "ios" | "android" | "web", isElectron: boolean, hostPlatform?: string) returning "ios" | "android" | "macos-electron" | "electron" | "browser".
- Produces: one native route shell for iOS/Android compact navigation and one web shell for browser/Electron. The web shell selects the macOS sidebar when the existing Electron and host-platform signals identify macOS.
- Existing route paths and tab destinations remain Home, Search, Library, Downloads, and Settings.

- [ ] Add resolver tests for iOS, Android, browser, macOS Electron, and non-macOS Electron, including a safe fallback when host-platform data is absent.
- [ ] Add the native tabs layout with Expo Router’s SDK 57 native-tabs API, isolated in its own platform file. Retain the current layout as the web fallback and preserve every current route/deep link.
- [ ] Add the macOS sidebar/toolbar shell. If Electron vibrancy is enabled, use the system sidebar material only behind that shell, make content surfaces opaque, and verify the opaque fallback.
- [ ] Keep browser desktop navigation separate from the macOS Electron shell. Use useWindowClass() for compact/medium/expanded/large decisions.
- [ ] Update UI.md and the visual contract with the platform matrix, no-card list rule, and Apple-only system-material boundary.
- [ ] Run the resolver and DesktopLayout Jest tests plus the mobile typecheck.

### Task 2: Replace the shared episode-row look with platform episode lists

**Files:**

- Modify: apps/mobile/components/catalog/EpisodeSelector.tsx
- Create: apps/mobile/components/catalog/EpisodeListView.types.ts
- Create: apps/mobile/components/catalog/EpisodeListView.ios.tsx
- Create: apps/mobile/components/catalog/EpisodeListView.android.tsx
- Create: apps/mobile/components/catalog/EpisodeListView.web.tsx
- Test: apps/mobile/components/catalog/**tests**/EpisodeSelector.test.tsx, adding platform view tests beside it.

**Interfaces:**

- EpisodeListViewProps carries the selected season, visible episodes, selected/expanded episode identity, and callbacks for season selection, playback, download, and source expansion.
- EpisodeSelector remains the owner of route-derived initial episode, season/episode selection, and expanded-source state. Platform views own only layout and control presentation.
- EpisodeStreamList and source-choice behavior continue to use the current playback/source components and callbacks.

- [ ] Add characterization assertions for initial route episode, season switching, play, download, and source expansion before changing presentation.
- [ ] Split the row and season-control rendering into the three platform views while retaining the shared selector state.
- [ ] On every platform, use flat rows, typography and hairline dividers for hierarchy. Keep selection and playback progress explicit; avoid a background/border/radius for every episode.
- [ ] Use platform-appropriate action affordances and accessible labels. Keep Play obvious, Download secondary, and More Sources collapsed until requested.
- [ ] Verify long titles, no episode data, many episodes, keyboard focus on web, and screen-reader selection/expanded state.
- [ ] Run EpisodeSelector and Detail episode-context tests plus the mobile typecheck.

### Task 3: Give Library its own platform presentations

**Files:**

- Modify: apps/mobile/app/(tabs)/library.tsx
- Create: apps/mobile/components/library/LibraryScreenView.types.ts
- Create: apps/mobile/components/library/LibraryScreenView.ios.tsx
- Create: apps/mobile/components/library/LibraryScreenView.android.tsx
- Create: apps/mobile/components/library/LibraryScreenView.web.tsx
- Modify: apps/mobile/app/(tabs)/**tests**/LibraryScreen.test.tsx
- Add: platform-view tests under apps/mobile/components/library/**tests**/

**Interfaces:**

- LibraryScreenView receives the route’s resolved collection/history items, active filter, loading/refresh/selection state, and callbacks for filtering, opening, selecting, removing, refreshing, and undoing.
- The route remains the owner of useLibrary/useWatchHistory, query mutations, URL view=history, bulk selection, and undo scheduling.

- [ ] Add behavior assertions for collection/history filtering, deep-linked history, selecting items, single/bulk removal, refresh, and undo.
- [ ] Render artwork-first Library layouts per platform: iPhone uses an uncluttered poster grid; Android uses its own grid density and contextual action pattern; macOS uses a dense pointer/keyboard-friendly grid with clear focus and selection.
- [ ] Remove decorative card backgrounds and nested surfaces while keeping poster imagery, title, watch progress, and verified offline state legible.
- [ ] Preserve empty, loading, unauthenticated, refreshing, and history-pagination states.
- [ ] Run LibraryScreen and libraryPresentation tests plus the mobile typecheck.

### Task 4: Give Downloads a platform-specific queue without changing queue behavior

**Files:**

- Modify: apps/mobile/app/(tabs)/downloads.tsx and apps/mobile/components/downloads/DownloadQueueCard.tsx
- Create: apps/mobile/components/downloads/DownloadsScreenView.types.ts
- Create: apps/mobile/components/downloads/DownloadsScreenView.ios.tsx
- Create: apps/mobile/components/downloads/DownloadsScreenView.android.tsx
- Create: apps/mobile/components/downloads/DownloadsScreenView.web.tsx
- Modify: apps/mobile/app/(tabs)/**tests**/DownloadsScreen.test.tsx and apps/mobile/components/downloads/**tests**/DownloadQueueCard.test.tsx

**Interfaces:**

- DownloadsScreenView receives the current queue summary, tasks, selection/busy state, and existing command callbacks.
- The route and download store remain the owners of queue state, pause/resume/retry/verify/recovery, offline play eligibility, and deletion/undo.

- [ ] Add assertions for queue status, pause/resume, retry/verify, play-ready-offline, selection, destructive confirmation, and timed undo before changing layout.
- [ ] Replace repeated rounded queue cards with compact platform-specific list rows; show progress/status inline and reveal secondary actions through each platform’s menu or row controls.
- [ ] Keep recovery actions visible when required; keep bulk destructive actions behind the existing selection/undo flow.
- [ ] Check narrow phones, wide desktop, long titles, failed/incomplete tasks, empty queue, and offline-ready state.
- [ ] Run DownloadsScreen, DownloadQueueCard, SmartDownloadsStatus tests, and mobile typecheck.

### Task 5: Redesign Settings as platform preference lists

**Files:**

- Modify: apps/mobile/components/settings/SettingsExperience.tsx and apps/mobile/components/settings/SettingsRows.tsx
- Create: apps/mobile/components/settings/SettingsScreenView.types.ts
- Create: apps/mobile/components/settings/SettingsScreenView.ios.tsx
- Create: apps/mobile/components/settings/SettingsScreenView.android.tsx
- Create: apps/mobile/components/settings/SettingsScreenView.web.tsx
- Modify: apps/mobile/app/settings/[section].tsx and existing SettingsExperience tests only if presentation wiring requires it.

**Interfaces:**

- SettingsExperience remains the owner of section routing, preference state, account/readiness data, and settings actions.
- SettingsScreenView receives the selected section, resolved preference rows, and existing action callbacks; section URLs remain /settings/[section].

- [ ] Add behavior assertions for section navigation/deep links, true binary toggles, multi-value choices, account actions, readiness/review, and loading/disabled actions.
- [ ] Use an iOS grouped preference list, Android preference rows and native-feeling choice dialogs, and a macOS settings sidebar plus compact preference rows. Browser settings remain responsive and keyboard-accessible.
- [ ] Keep true on/off preferences as switches. Present enums and multi-select choices as choices; do not turn every preference into another toggle.
- [ ] Replace nested decorative cards with one continuous settings canvas, section headings, alignment, and restrained dividers. Keep meaningful warning/readiness panels where they communicate state.
- [ ] Preserve account, security, downloads, appearance, personalization, language, source, and diagnostics behavior and the existing section URLs.
- [ ] Run SettingsExperience, settings section, downloads settings, appearance, language, and sources tests plus mobile typecheck.

### Task 6: Inspect the platform matrix and close visual regressions

**Files:**

- Update only the affected tests, screenshots, and UI.md notes from Tasks 1–5.
- Do not stage or alter unrelated worktree files.

- [ ] Run the focused Jest tests from Tasks 1–5 and npm run typecheck --workspace=mobile.
- [ ] Run npm run test:golden-path for phone and desktop browser flows; inspect changed screens at phone and desktop sizes.
- [ ] Run the Electron smoke checks and inspect the packaged macOS shell for sidebar material fallback, keyboard navigation, traffic-light clearance, and focus visibility.
- [ ] Run the iOS and Android simulator E2E flows when the configured simulators are available. Record unavailable native/device evidence as unknown rather than inferring it from web screenshots.
- [ ] Inspect compact and wide layouts, dark and light themes, loading/empty/error/offline/disabled states, localized long labels, keyboard/pointer input, and reduced-motion/transparency behavior.
- [ ] Check the complete diff against UI.md, the visual contract, route/deep-link behavior, and the review-focus cases above.

## Compatibility, Rollback, and Risks

- This is a presentation-only migration. No user data, API contract, persisted state, playback plan, or download format changes.
- Expo Router 57 exposes native tabs under an unstable import. Isolate the native shell so it can be reverted to the current JavaScript tab layout without changing feature routes. Do not upgrade Expo as a side effect; evaluate the stable API only during a separately scoped SDK upgrade.
- Electron supports macOS vibrancy at the window layer. Treat it as an optional native material for navigation chrome, retain the existing opaque rendering as fallback, and do not expose new preload/IPC methods. Electron’s vibrancy is not the same implementation as SwiftUI Liquid Glass.
- If platform-specific views start duplicating state or callbacks, keep the shared controller and narrow the view contract rather than cloning route logic.
- The initial implementation has no feature flag: each feature switches to its new presentation behind the same route. Rollback is a revert of the affected presentation/shell task; persisted state is unaffected.

## Research Basis

- Expo documents native tabs for SDK 55–57 as an unstable import; on iOS 26 and later the operating system draws the native tab bar with Liquid Glass. Expo also documents separate platform layouts/modules for platform-specific UI. See [Expo Router native tabs for SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/) and [platform-specific modules](https://docs.expo.dev/router/advanced/platform-specific-modules/).
- Apple’s guidance places Liquid Glass in the functional navigation/control layer and advises against putting it in the content layer. Apple’s tab-bar and sidebar guidance describes tabs for compact top-level navigation and sidebars when there is enough room. See [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), and [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars).
- Android recommends adaptive navigation patterns by available window size, including a navigation bar on compact screens and a rail on larger screens. See [Android adaptive navigation](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns?hl=en) and [adapt layouts](https://developer.android.com/design/ui/mobile/guides/layout-and-content/adapt-layout?hl=en).
- Electron documents native macOS window vibrancy, including a sidebar material. This can support a restrained Mac shell while leaving content surfaces opaque. See [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window).

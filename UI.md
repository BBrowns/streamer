# Streamer — UI Architecture & Design Reference

> **Audience:** Engineers (human or AI agent) working on the mobile/web/desktop client.
> This document covers design decisions, component architecture, cross-platform patterns, and concrete improvement suggestions.
> See [ARCHITECTURE.md](./ARCHITECTURE.md) for the backend and system-level reference.
> See [AGENT_HANDOFF.md](./AGENT_HANDOFF.md) for the current product direction and next UI/UX priorities.

---

## 1. Design Philosophy

The current product direction is **pastel glass cinema**: Apple-inspired, soft, cinematic, and calm enough for repeated media browsing. This is the target direction; some older components still show heavier/darker styling and should be treated as migration candidates.

- **Pastel glass:** warm mist backgrounds, frosted cards, restrained borders, lavender/blush/mint/peach accents.
- **Cinematic media hierarchy:** large artwork, clear Play Best action, visible next content, and less source noise.
- **Consumer-streaming UX:** users should not have to understand torrents, codecs, peers, bridge URLs, or add-on internals to press Play.

The long-term references are closer to Apple TV/Vision Pro-style media surfaces, StreamX-like Apple platform structure, Infuse, Plex, Netflix, Disney+, and Prime Video than to a technical source browser.

The current UI is an improved baseline, not the final Netflix/Disney+/Prime
quality product. Future UI work should be screenshot-driven and should preserve
the now-central playback architecture.

Primary hierarchy:

1. `Play Best` is the main action.
2. Download, Cast, and Add are secondary actions.
3. `More Sources` is collapsed by default and treated as an advanced fallback.
4. Sources & Devices explains bridge/add-on health without forcing users to
   understand torrents or codecs before pressing Play.

**Styling approach:** The codebase uses two coexisting styling systems:

- **NativeWind v4** (Tailwind for React Native) for utility classes in some components.
- **`StyleSheet.create()`** with `useTheme()` for dynamic, theme-aware styles in all core components.

In practice, most components use `StyleSheet.create` with inline `colors.xxx` references, not Tailwind classes. NativeWind is present (`global.css`, `tailwind.config.js`, `nativewind-env.d.ts`) but is the minority pattern. New components should default to `StyleSheet.create` + `useTheme`.

Tamagui is not currently a committed full-app migration. If introduced, treat
it as a pilot for constrained primitives such as buttons, surfaces, sheets,
status pills, and settings panels before replacing large screens.

Useful future primitives:

- `AppButton`
- `Surface`
- `ContentCard`
- `StatusPill`
- `SectionHeader`
- `PlaybackStatusPanel`
- `EmptyState`
- `ErrorState`
- `ActionSheet`

Current pilot primitives:

- `components/ui/AppButton.tsx` for primary, secondary, ghost, and danger
  actions with consistent sizing, icon support, loading state, and accessibility
  state.
- `components/ui/Surface.tsx` for bordered pastel glass panels.
- `components/ui/StatusPill.tsx` for bridge/playback/download readiness labels.
- `components/ui/TextField.tsx` for themed form inputs.

The first pilot migration is `SourcesSection`, because bridge/add-on setup is
one of the highest-friction product areas. Future PRs should reuse these
primitives before adding another local button/card/input style.

The detail-screen action hierarchy now uses `DetailActionPanel` to keep
`Play Best` primary for movies, keep series playback on episode rows, and keep
Download, Cast, and Add as secondary actions.

Do not do:

- Do not perform a full visual rewrite in one PR.
- Do not reintroduce neon/dark-heavy styling as the default app identity.
- Do not expose raw source complexity as the primary detail-screen flow.
- Do not add a marketing landing page instead of improving the actual app
  screens.
- Do not merge meaningful UI changes without desktop and phone screenshot QA.

---

## 2. Theme System

### 2.1 Palette (`constants/theme.ts`)

The entire colour system is defined in a single `PALETTE` object with two variants:

| Token           | Dark                     | Light                      | Usage                                  |
| --------------- | ------------------------ | -------------------------- | -------------------------------------- |
| `background`    | `#11121c`                | `#fbf6f4`                  | Cinematic midnight / soft warm mist    |
| `card`          | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.72)`   | Frosted surfaces                       |
| `text`          | `#fff8ff`                | `#282236`                  | Primary text                           |
| `textSecondary` | `#c6bfd2`                | `#6f657d`                  | Labels, subtitles                      |
| `tint`          | `#d8b4fe` (lavender)     | `#a78bfa` (soft violet)    | Accent — buttons, active states, icons |
| `border`        | `rgba(255,255,255,0.14)` | `rgba(106, 93, 125, 0.16)` | Dividers, glass borders                |
| `error`         | `#ff9ba6`                | `#df6b7a`                  | Error text, destructive actions        |
| `success`       | `#a7e8bd`                | `#63b987`                  | Confirmations                          |
| `warning`       | `#ffd9a8`                | `#d7a15f`                  | Warnings, incomplete states            |

**Key design decision:** The palette has moved away from neon cyan/dark sci-fi styling toward softer lavender and warm glass. Future UI work should keep that direction and avoid returning to one-note neon or heavy dark-only surfaces.

### 2.2 `useTheme()` Hook

Every themed component calls `useTheme()` which:

1. Reads `themePreference` from `authStore` (`"system"`, `"dark"`, or `"light"`).
2. Falls back to `useColorScheme()` (the OS setting) when preference is `"system"`.
3. Returns `{ isDark, colors, themePreference }`.

**Intricacy:** Styles that depend on `isDark` or `colors` must be computed inside the render function — either as a `useMemo(() => StyleSheet.create(...), [colors, isDark])` (pattern used in `player.tsx`) or via inline style objects. Static `StyleSheet.create()` at module level cannot reference theme tokens because `StyleSheet.create` runs once at module load time, before any theme is known. The player screen demonstrates the correct pattern.

### 2.3 Button Text Colour Inversion

Every button in the app uses the pattern:

```tsx
color: isDark ? "#000" : "#fff";
```

This is because the tint colour changes between modes and needs different foreground contrast. If the tint changes significantly, verify contrast in both themes instead of blindly keeping this inversion.

---

## 3. Cross-Platform Layout Strategy

The app targets five environments from a single codebase: iOS, Android, Web (browser), Web (Electron), and potentially iPad. The layout adapts at two levels.

### 3.1 Navigation Shell

| Viewport                | Navigation                                        |
| ----------------------- | ------------------------------------------------- |
| Mobile (iOS/Android)    | Bottom tab bar (Expo Router `(tabs)/_layout.tsx`) |
| Desktop web (≥ 1024 px) | Persistent left sidebar (`DesktopLayout.tsx`)     |

`DesktopLayout` is a wrapper component used in the root layout. It uses `Platform.OS === "web" && width > 1024` as its guard. On mobile it is a passthrough (`return <>{children}</>`). This means the sidebar and tab bar are **mutually exclusive** — there is no double navigation on large phones in landscape.

The sidebar includes:

- App logo mark (coloured square with a play icon + wordmark)
- Primary nav items (Home, Discover, Library, Downloads)
- A spacer that pushes Settings to the bottom
- A `⌘K` keyboard shortcut badge on the Search item (web-only, rendered conditionally)
- Hover states using `onPointerEnter`/`onPointerLeave` — web APIs that are no-ops on native

### 3.2 Responsive Grid (`useResponsiveColumns`)

The catalog grids (`FlatList` with `numColumns`) use `useResponsiveColumns()`:

| Width     | Columns |
| --------- | ------- |
| ≥ 1280 px | 6       |
| ≥ 1024 px | 5       |
| ≥ 768 px  | 4       |
| ≥ 480 px  | 3       |
| < 480 px  | 2       |

This is the only layout breakpoint system in use. There is no CSS media query equivalent — everything flows through `useWindowDimensions()`.

**Intricacy:** `FlatList` requires a `key` prop change when `numColumns` changes (e.g. `key={`grid-${numColumns}`}`). Without this, React Native throws a warning and the grid does not re-render correctly. This is done correctly in the home screen but is a common pitfall when adding new grids.

### 3.3 Desktop Hero Banner

On desktop (≥ 1024 px), the home screen shows a `HomeHeroBanner` using the first catalog item. The banner is hidden on mobile to preserve screen real estate. The first item is sliced out of the `FlatList` data array (`movies?.slice(1)`) when the hero is active to avoid duplicating it in the grid below.

---

## 4. Component Library (`components/ui/`)

These are the foundational building blocks used across all screens.

### 4.1 `EmptyState`

A configurable zero-state component with three sizes (`small`, `medium`, `large`). Supports either an `icon` (Ionicons glyph) or a raw `emoji`, an optional description, and an optional CTA button.

**Design decision:** `size="medium"` automatically upgrades to `large` on desktop (≥ 1024 px). This means the same `<EmptyState size="medium" />` call renders at different scales depending on platform — consistent intent, adaptive presentation.

### 4.2 `SkeletonLoader` / `SkeletonCardGrid` / `SkeletonRow`

Animated pulse loader for content-awaiting states. Uses the `Animated` API (not Reanimated) — a deliberate choice to keep it simple and avoid requiring the Reanimated worklet setup for a basic opacity loop.

Three composite exports:

- `SkeletonLoader` — a single configurable element (card 2:3 ratio, row, text line, circle).
- `SkeletonCardGrid` — a wrapping grid of skeleton cards; used during catalog loading.
- `SkeletonRow` — horizontal scroll placeholder for `CatalogRow`.

Accessibility: All skeletons have `accessibilityRole="progressbar"` and `accessibilityLabel="Loading content"`.

### 4.3 `ErrorBoundary`

A class component (React class components are required for error boundaries — hooks cannot implement `getDerivedStateFromError`). Wraps every screen via the home screen pattern:

```tsx
// app/(tabs)/index.tsx
export default function HomeScreen() {
  return (
    <ErrorBoundary>
      <HomeContent />
    </ErrorBoundary>
  );
}
```

**Intricacy:** Sentry is imported via `require()` lazily inside `componentDidCatch`. This is intentional — it makes the `ErrorBoundary` component safe to use in environments where Sentry is not configured (e.g. local development without a DSN), without causing a module-load crash.

**Known gap:** The `ErrorBoundary` hardcodes dark colours (`#0a0a1a` background, `#e0e0ff` title) rather than using `useTheme`. It cannot use hooks (it's a class component), and no `ThemeContext` is set up. See [Section 11, item 1](#11-future-improvement-suggestions) for the fix.

### 4.4 `FilterChipBar`

A horizontal scrollable row of toggle chips. Used on the home screen to switch between Movies and Series. Implemented with `ScrollView horizontal` — not `FlatList` — because the number of options is always small and known.

### 4.5 `OfflineBanner`

Polls `expo-network` for connectivity and shows a persistent top banner when offline. Displayed at the top of the `ListHeaderComponent` in the home screen's `FlatList`.

### 4.6 `WatchProgressBar`

A thin horizontal progress bar rendered below catalog cards to indicate watch progress. Reads from the `WatchProgress` data returned by `useContinueWatching`.

### 4.7 `CommandPalette`

A keyboard-driven search overlay (web/desktop). Triggered by `⌘K`. Renders a modal with a text input and live search results using `useGlobalSearch`. Uses `KeyboardAvoidingView` and handles `Escape` key to dismiss.

### 4.8 `DesktopLayout`

See Section 3.1 above.

### 4.9 `BiometricLockOverlay`

An overlay that gates access to the app behind biometric authentication using `expo-local-authentication`. Activated on app foreground if enabled in settings. Renders over the entire screen using `position: absolute` fill.

---

## 5. Catalog Components (`components/catalog/`)

### 5.1 `CatalogItemCard`

The primary content card. Renders a poster image (`Image` with `resizeMode="cover"`), a title, and optionally a `WatchProgressBar`. Wrapped in a `Pressable` with haptic feedback (`expo-haptics`) on iOS/Android.

The card uses `aspectRatio: 2/3` (standard movie poster ratio) to ensure consistent sizing regardless of image dimensions.

**Intricacy:** Poster images come from external add-on APIs and have unpredictable dimensions and CDN availability. The `Image` component does not have an automatic fallback — if the poster URL is 404, a broken image renders. An `onError` fallback to a placeholder image is missing.

### 5.2 `ContinueWatchingRow`

A horizontal `FlatList` of in-progress content from `useContinueWatching`. Only rendered when there is at least one item with progress > 0 and < 100%. Each item shows the poster and a `WatchProgressBar` at the bottom.

### 5.3 `EpisodeSelector`

A compound component for TV show episode navigation. Displays a season picker (segmented control or dropdown) and a vertical list of episodes with runtime, watched state, and a play button.

**Known historical bug:** Duplicate `key` props were a source of React warnings when episode lists had entries with the same `id` field from different add-ons. Fixed by using a composite key `${season}-${episode}-${addonId}`.

### 5.4 `HeroBanner` / `HomeHeroBanner`

Full-bleed hero image with a gradient overlay, title, genre tags, and action buttons (Play, Add to Library). `HomeHeroBanner` is the desktop-only variant on the home screen; `HeroBanner` is used on the detail screen for both mobile and desktop.

---

## 6. Player Components (`components/player/`)

The player screen (`app/player.tsx`) is the most complex screen in the app. It was deliberately decomposed into sub-components to manage complexity, with logic extracted into custom hooks.

### 6.1 Component Composition

```
PlayerScreen (app/player.tsx)
├── VideoView (expo-video)          — native video renderer
├── PlayerOverlay                   — gesture handler root, tap-to-show/hide controls
│   ├── PlayerControls              — play/pause, seek bar, time, cast button
│   ├── PlayerSettingsModal         — audio track, subtitle track, playback speed
│   ├── PlayerStatusOverlay         — typed readiness/error state
│   ├── NextEpisodeOverlay          — "Up Next: Episode X" auto-play prompt
│   └── RemoteControlBar            — Chromecast / AirPlay remote UI (when casting)
└── DesktopCastModal                — device selector modal for web/Electron
```

### 6.2 `PlayerOverlay`

Manages `controlsVisible` state using a 4-second auto-hide timer. Taps anywhere toggle the controls. Double-tap on the left or right half of the screen seeks ±10 seconds (standard mobile video player convention). A visual seek feedback indicator (`"+10s"` / `"-10s"`) shows briefly then fades — implemented with a timer ref and `seekFeedback` state, not an animation, because the requirement is to reset the timer on repeated taps.

### 6.3 `PlayerControls`

Renders the bottom control bar:

- Seek bar (custom, not a native slider — `react-native-gesture-handler` `PanGestureHandler` for scrubbing)
- Current time / duration
- Play/Pause, Skip ±10s
- Playback speed indicator
- Cast button (conditional on platform)

### 6.4 `usePlayerHotkeys`

Extracted hook for keyboard shortcuts on web/desktop. Handles:

| Key           | Action                                  |
| ------------- | --------------------------------------- |
| `Space` / `K` | Play/Pause                              |
| `←` / `→`     | Seek ±10s                               |
| `↑` / `↓`     | Volume ±10% (mocked via visual overlay) |
| `F`           | Toggle fullscreen                       |
| `M`           | Toggle mute                             |
| `[` / `]`     | Decrease / increase playback speed      |
| `Escape`      | Close player                            |

All listeners are added to `document` (web only — guarded by `Platform.OS === "web"`). Listeners are cleaned up in the `useEffect` return to avoid leaks.

### 6.5 Progress Reporting

The player reports watch progress to the server every `15_000` ms (`PROGRESS_REPORT_INTERVAL`) via `useUpdateProgress` (a React Query mutation). The interval is managed via `setInterval` in a ref (`progressTimerRef`) and cleared on component unmount. Progress is also reported on player exit.

**Intricacy:** The `useTraktScrobbler` hook fires independently from this interval, using the player's local state. The two are not synchronised — Trakt scrobbles can arrive at the server slightly before or after the watch progress update. This is acceptable for the use case but means `lastWatched` timestamp in the database and the Trakt scrobble timestamp may differ slightly.

### 6.6 Runtime Readiness States

The player no longer treats every loading problem as generic `Buffering...`.
`playerStore` tracks typed `runtimeState` and `runtimeError` values from `@streamer/shared`.

Important visible states:

| Runtime state               | UX meaning                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `creating_gateway_job`      | The bridge is creating a stream gateway job.                                                |
| `finding_peers`             | A torrent source is waiting for peers.                                                      |
| `preparing_metadata`        | Torrent metadata exists and the bridge is warming.                                          |
| `buffering`                 | A playable URL exists but video is not ready yet.                                           |
| `trying_fallback`           | The app is automatically trying another source.                                             |
| `failed_no_peers`           | Torrent source could not find peers in time.                                                |
| `failed_bridge_unavailable` | The desktop/local bridge is missing or unreachable.                                         |
| `failed_bridge_unsupported` | The bridge process is reachable but its engine is broken, commonly native runtime mismatch. |
| `failed_unsupported_codec`  | The selected source cannot play on this device.                                             |
| `failed_timeout`            | Gateway or video startup timed out.                                                         |

`PlayerStatusOverlay` uses these states for titles, retry visibility, and Sources & Devices guidance. Keep future player work in this typed model rather than adding raw alert strings.

---

## 7. Detail Screen (`app/detail/[type]/[id].tsx`)

The detail screen fetches:

1. **Metadata** (`useMeta`) — title, poster, backdrop, description, cast, genre, rating.
2. **Streams** (`useStreams`) — all available streams from add-ons that support the content type/id.
3. **Library status** (`useLibrary`) — whether the item is already in the user's library.
4. **Watch progress** (`useContinueWatching`) — resume position.

For series, it additionally renders the `EpisodeSelector` component to let the user pick a season and episode, then fetches streams for that specific episode via `useEpisodeStreams`.

**Primary flow:** The default action is `Play Best`. It calls `PlaybackOrchestrator.playBest()`, which requests a server playback plan, resolves only the selected source, and passes remaining planned fallbacks into `playerStore`.

**Advanced source display:** Streams are still grouped and displayed with a resolution chip selector (chips for 4K, 1080p, 720p, 480p). This should remain collapsed as `More Sources`, not the main user flow. Tapping a manual stream remains an advanced path and should not bypass the session-driven primary Play Best path.

---

## 8. Settings Screen (`app/(tabs)/settings.tsx`)

The settings screen is divided into sections using `CollapsibleSection` components:

- **Profile** — display name, avatar, email, biometric lock toggle
- **Appearance** — theme selector (System / Light / Dark)
- **Add-ons** — shortcut to `/addons` management screen
- **Trakt.tv** — OAuth connect/disconnect, sync status
- **Active Sessions** — list of current device sessions with logout-individual option
- **Notifications** — list of in-app notifications
- **About** — app version, privacy policy, terms

The Trakt OAuth flow uses `expo-web-browser` to open the Trakt authorization URL, then captures the redirect via deep link.

---

## 9. State Management

The app uses **Zustand v5** with multiple small, focused stores rather than one large global store:

| Store           | Persisted              | Contents                                                                                        |
| --------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `authStore`     | ✅ `expo-secure-store` | `isAuthenticated`, `user`, tokens, theme, configured `streamServerUrl`, bridge token, hydration |
| `playerStore`   | ❌ (session only)      | `currentStream`, fallback queue, `runtimeState`, `runtimeError`, metrics, progress, preferences |
| `downloadStore` | ✅ `AsyncStorage`      | `tasks` map (id → status/progress/localUri/resumeData)                                          |

**Auth hydration guard:** The `authStore` sets `isHydrated: true` once it has loaded from `expo-secure-store`. All screens check `isHydrated` before rendering content or redirecting to login — this prevents a flash of the login screen while the token is being read from the keychain.

**`playerStore` is not persisted** intentionally — stream URLs are often short-lived (Real-Debrid tokens, torrent pipe sessions). Persisting them would cause broken playback on app restart.

---

## 10. Data Fetching Layer

All server communication goes through **TanStack Query (React Query) v5** using a thin `axios` wrapper (`services/api.ts`).

Each domain has a custom hook:

| Hook                    | Query key               | Purpose                            |
| ----------------------- | ----------------------- | ---------------------------------- |
| `useCatalog(type)`      | `["catalog", type]`     | Fetches the main catalog grid      |
| `useMeta(type, id)`     | `["meta", type, id]`    | Fetches detail metadata            |
| `useStreams(type, id)`  | `["streams", type, id]` | Fetches available streams          |
| `useLibrary()`          | `["library"]`           | User's saved items                 |
| `useContinueWatching()` | `["continue-watching"]` | In-progress items (watch progress) |
| `useAddons()`           | `["addons"]`            | User's installed add-ons           |
| `useNotifications()`    | `["notifications"]`     | In-app notifications               |
| `useSessions()`         | `["sessions"]`          | Active device sessions             |

**Authentication interception:** `services/api.ts` has an Axios response interceptor that catches `401` responses, attempts a token refresh via `POST /api/auth/refresh`, and retries the original request. If the refresh fails (expired or revoked refresh token), the user is logged out. **Intricacy:** This interceptor uses a `Promise`-based queue to prevent multiple concurrent refresh attempts when several requests 401 simultaneously — without this, the refresh endpoint would be called N times in parallel and all but one would fail.

**Stale time:** Default stale time is React Query's default (0ms). This means navigating back to a screen with cached data shows it instantly but triggers a background refetch. For catalog data this is acceptable; for user library it means additions from another device are picked up quickly.

---

## 11. Future Improvement Suggestions

### High Priority

#### 1. Theme-Aware ErrorBoundary

`ErrorBoundary` is a class component that hardcodes dark mode colours (`#0a0a1a` background). The fix is to introduce a `ThemeContext` (React context) that provides colours without hooks, then consume it via `static contextType = ThemeContext` inside the class component. This is a standard React pattern for class components and would make the error screen consistent with the rest of the app in light mode.

#### 2. Image Fallback for Catalog Cards

`CatalogItemCard` and the detail screen poster render `<Image source={{ uri: poster }}>` with no `onError` handler. When an add-on returns a broken or expired poster URL (common with some Stremio add-ons), the result is a blank or broken image. Add an `onError` → replace `source` with a local placeholder asset (e.g. a blurred branded card background). A `useState` pattern switching between the remote URI and a `require('../assets/placeholder.png')` source handles this cleanly.

#### 3. Pagination / Infinite Scroll in Catalog

The catalog `FlatList` loads all items from the first API call. The aggregator supports a `skip` parameter, and the `AggregatorService.getCatalog` method accepts `skip`. However, the mobile `useCatalog` hook never passes `skip`. As catalog sizes grow (Cinemeta returns hundreds of items), this creates a large initial payload. Implement React Query's `useInfiniteQuery` with `getNextPageParam: (last, all) => all.length * PAGE_SIZE` and add an `onEndReached` handler on the `FlatList`.

#### 4. Reanimated-Based Skeleton Shimmer

The `SkeletonLoader` uses the legacy `Animated` API for its opacity pulse. Moving to `react-native-reanimated` (already in the project at v4.2.1) would allow a horizontal gradient shimmer effect (via `LinearGradient` + a shared value animated position) rather than a simple opacity pulse, which is the standard modern pattern and looks significantly more polished.

#### 5. Stream List Virtualization

The stream list on the detail screen renders inside a `ScrollView` (not a `FlatList`). For popular content, Torrentio can return 50–200+ streams. Rendering all of them at once causes jank on lower-end Android devices. Replace with a `FlashList` (`@shopify/flash-list`, which recycling-list-compatible with variable height) for the stream list.

### Medium Priority

#### 6. Biometric Lock Session

`BiometricLockOverlay` re-authenticates on every app foreground event (`AppState` change to `"active"`). This is aggressive for normal use — users unlock their phone every few minutes. Implement a session timeout: if the app was last active < 5 minutes ago, skip re-authentication. Store `lastForegroundTime` in the `authStore`.

#### 7. Keyboard Navigation for Desktop

On Electron/web, interactive elements (catalog cards, episode list items) are not reachable via `Tab` key navigation. Add `focusable`, `onKeyDown`, and focus ring styles to `CatalogItemCard`, `NavLink`, and the stream list items. The `DesktopLayout` sidebar navigation is partially keyboard-accessible via Expo Router's `<Link>` (which renders an `<a>` tag on web), but the main content area is not.

#### 8. Player Seek Bar Accessibility

The custom seek bar in `PlayerControls` uses a gesture handler and is not accessible to screen readers or keyboard users. It has no `accessibilityRole`, no `accessibilityValue`, and no keyboard event handling. Replace or augment with an accessible slider that exposes `accessibilityRole="adjustable"` and `accessibilityValue={{ min: 0, max: duration, now: currentTime }}`.

#### 9. Offline-First Library

The `useLibrary` and `useContinueWatching` hooks have no offline persistence — if the device is offline, the lists are empty. Since this data changes infrequently, it's a strong candidate for React Query's `persistQueryClient` plugin with `AsyncStorage` as the persister. This would show stale cached library data when offline rather than an empty state.

#### 10. `CommandPalette` on All Platforms

The `CommandPalette` is desktop-only (`Platform.OS === "web"`). On mobile, there is no global search shortcut — the search screen is a separate tab. A long-press on the search tab icon or a pull-down gesture on the home screen could reveal an equivalent search overlay on native platforms.

### Lower Priority

#### 11. Split `player.tsx` Further

`app/player.tsx` is ~800 lines despite already being decomposed. The Chromecast cast detection logic, the `previousProgress` resume prompt, and the `seekFeedback` animation could each be extracted into separate components or hooks. A `useCast` hook (managing `remoteMediaClient` setup and the `lastCastUriRef`) and a `useResumePrompt` hook would each be ~30–50 lines and make the player's main render function much easier to read.

#### 12. Add `react-native-fast-image` for Poster Caching

Expo's `<Image>` component does memory and disk caching, but it re-decodes images on scroll when they leave the `FlatList` render window. `@shopify/flash-list` pairs well with `expo-image` (the newer replacement for `expo/image`), which uses the native SDWebImage (iOS) and Glide (Android) for aggressive caching. Migrating catalog cards to `expo-image` would reduce scroll jank on large catalogs.

#### 13. i18n Completeness

The `i18next` setup and locale files exist, but not all strings in the codebase are extracted. Several components have hardcoded English strings (notably `ErrorBoundary`, `PlayerSettingsModal`, and parts of the detail screen). A systematic pass with `i18next-scanner` to find unharvested strings, combined with adding missing locale keys to `locales/en.json`, would complete internationalisation.

---

## 12. Platform-Specific Intricacies

### `Platform.OS === "web"` Guards

Many features branch on `Platform.OS === "web"`. File downloads, the `CommandPalette`, `desktopBridge` detection, keyboard event listeners, and hover states all use this guard. On native, web-specific code is dead code but is not tree-shaken unless using platform-specific file extensions (e.g. `.web.ts`). Some hooks already do this (e.g. `useClientOnlyValue.ts` / `useClientOnlyValue.web.ts`). The more complex branching cases should be moved to platform-specific files.

### `onPointerEnter` / `onPointerLeave` on Native

The `DesktopLayout` `NavLink` component uses `onPointerEnter` and `onPointerLeave` for hover effects. These are web-only pointer events that React Native (pre-0.74) ignores silently. With React Native 0.83 (current), these are now supported on iOS and iPadOS with a pointer device (trackpad, mouse). This is correct behaviour — hover effects will now also work on iPad with a connected mouse.

### `Dimensions.get` vs `useWindowDimensions`

`DesktopLayout` uses `Dimensions.get("window")` (a synchronous, non-reactive read) for its initial desktop check, while most other components use `useWindowDimensions()` (reactive, re-renders on resize). `DesktopLayout` should be migrated to `useWindowDimensions()` to correctly handle browser window resize — otherwise, the sidebar vs. tab bar decision is locked in at mount time.

### `expo-video` vs `expo-av`

The app uses `expo-video` (the new, recommended API from Expo SDK 50+). The older `expo-av` is deprecated and was the prior implementation. `expo-video` uses a `useVideoPlayer` hook and separates the player logic from the view (`VideoView` component), enabling multi-instance playback. The `VideoView` component renders via a native module and cannot be styled with arbitrary `borderRadius` or container transforms on iOS without a `<View>` wrapper with `overflow: "hidden"`.

### Zustand Selector Granularity

All `playerStore` selectors in `player.tsx` select individual fields:

```tsx
const currentStream = usePlayerStore((s) => s.currentStream);
const isBuffering = usePlayerStore((s) => s.isBuffering);
// ... 10+ more
```

This is correct and avoids unnecessary re-renders — each line only re-renders when its specific field changes. The anti-pattern to avoid is `const state = usePlayerStore()` (selects the entire store object, re-renders on any change).

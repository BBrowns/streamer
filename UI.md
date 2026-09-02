# Streamer — UI Architecture & Design Reference

> **Audience:** Engineers (human or AI agent) working on the mobile/web/desktop client.
> This document covers design decisions, component architecture, cross-platform patterns, and concrete improvement suggestions.
> See [ARCHITECTURE.md](./ARCHITECTURE.md) for the backend and system-level reference.
> See [AGENT_HANDOFF.md](./AGENT_HANDOFF.md) for the current product direction and next UI/UX priorities.

---

## 1. Design Philosophy

The active product direction is **Living Cinema**: artwork-first, full-bleed
media presentation with quiet utility chrome and a fully supported warm-neutral
light mode. Artwork and whitespace structure the screen; colour is derived
subtly from the current title instead of painted over every control.

The goal of this convergence pass is **visual convergence, not maximal
flattening**. A surface is justified when it communicates grouping, hierarchy,
modality, status, or interaction ownership. Remove decorative containment, but
preserve meaningful containment. This applies especially to Settings, Account,
Sources, Add-ons, Downloads, Notifications, diagnostics, warnings, destructive
actions, and overlays.

- **Living canvas:** dark `#08090B` or warm-neutral light canvas, with neutral
  Play/Resume actions and semantic accent only for focus, progress, selection,
  and temporary ambience.
- **Cinematic hierarchy:** platform system typography for interface roles and
  Instrument Serif only for large Home and Detail titles. Do not use the serif
  for settings, controls, metadata, or dense lists.
- **Artwork is content:** Home and Detail use sharp landscape backdrops without
  decorative blur or rounded hero cards. When no backdrop exists, render the
  2:3 poster contained on an ambient canvas; never crop a portrait poster to
  simulate landscape artwork.
- **Purposeful containment:** most media sits directly on the canvas. Borders,
  elevated surfaces, pills, and coloured icon tiles are reserved for state or
  a genuine floating/contained interaction.
- **Functional light mode:** dynamic ambience is clamped to 6% in light mode
  and never changes normal theme text colours or contrast ownership.
- **Consumer-streaming UX:** users should not have to understand torrents,
  codecs, peers, bridge URLs, or add-on internals to press Play.

The long-term references are closer to Apple TV/Vision Pro-style media surfaces, StreamX-like Apple platform structure, Infuse, Plex, Netflix, Disney+, and Prime Video than to a technical source browser.

Living Cinema builds on the adaptive foundation from PR #152 and the
correctness work from PR #154. It changes presentation and additive artwork
metadata only; routing, provider semantics, source selection, downloads,
casting, and the session-driven playback architecture keep their existing
owners.

Current UI phase (correctness and polish):

- Keep the existing Expo/React Native stack.
- Use the shared semantic palette and `useWindowClass()` for all new core UI.
- Compact navigation exposes Home, Search, Library, and Downloads in bottom
  tabs. Medium, expanded, and large windows use the shared horizontal topbar
  with Home, Library, and Downloads; Search is an action and keyboard overlay.
- Home uses one canonical `type:id` identity for hero and primary rails, with
  Continue Watching excluded from repeated recommendations. Provider rails
  also exclude content already claimed by those primary surfaces. Its existing
  provider rails are ordered with account-local Library and Continue Watching
  signals; this must not rename a provider catalog or invent recommendation
  semantics.
- Home remains the primary personalised discovery destination. An empty
  `/search` route may also browse up to six compatible, installed provider
  catalogs using their declared names and types, followed by recent searches.
  `/search` owns active title retrieval: suggestions, submitted results, and
  result filters. `/search/results` only preserves compatible links and
  parameters. Search responses include provider provenance and partial
  provider-failure metadata.
- Settings uses a compact category overview and `/settings/[section]` detail
  routes. The dashboard chooses one or two columns from available inner content
  width, minimum readable column width, and gutter; window class is an input,
  not a hardcoded one-/two-column rule. There is no second settings navigation
  rail.
- Home and Detail own cinematic page ambience. Catalog media may still use a
  restrained media-local progress, focus, or selected accent. Player only
  borrows its accent for progress/focus/selected state. Search, Settings,
  Library, Downloads, auth, and operational surfaces remain neutral and never
  consume artwork-driven page ambience.
- Keep the Expo/React Native stack; do not start a parallel UI-framework migration.
- Preserve the session-driven playback architecture and progressive disclosure
  of source/device complexity.

Primary hierarchy:

1. **Play** is the main consumer action; **Resume** replaces it from 15 seconds
   of saved progress. `playBest()` remains an internal planner action name.
2. Download, **Cast to device**, and **Add to Library** are secondary actions.
3. `More Sources` is collapsed by default and treated as an advanced fallback.
   It does not create a separate plan until expanded; it may reuse the
   runtime-only Play plan that Detail has already warmed, and its source count
   appears once.
4. Sources & Devices explains bridge/add-on health without forcing users to
   understand torrents or codecs before pressing Play.

**Styling approach:** The codebase uses two coexisting styling systems:

- **NativeWind v4** (Tailwind for React Native) for utility classes in some components.
- **`StyleSheet.create()`** with `useTheme()` for dynamic, theme-aware styles in all core components.

In practice, most components use `StyleSheet.create` with inline `colors.xxx` references, not Tailwind classes. NativeWind is present (`global.css`, `tailwind.config.js`, `nativewind-env.d.ts`) but is the minority pattern. New components should default to `StyleSheet.create` + `useTheme`.

Tamagui is not currently a committed full-app migration. If introduced, treat
it as a pilot for constrained primitives such as buttons, surfaces, sheets,
status pills, and settings panels before replacing large screens.

Core Living Cinema primitives:

- `AppButton`
- `AppSwitch`
- `Surface`
- `PageLayout`
- `ContentBoundary`
- `PageHeader`
- `PosterCard`
- `MediaRail`
- `SelectionActionBar`
- `SearchResultCard`
- `SettingsNavRow`
- `SettingsToggleRow`
- `SettingsChoiceRow`
- `FilterSheet`
- `ContentTabs`
- `SearchField`
- `MediaArtwork`
- `StatusPill`
- `PlaybackStatusPanel`
- `EmptyState`
- `ErrorState`
- `ActionSheet`
- `CinematicTopBar`
- `AmbientHero`
- `DynamicScrim`
- `MediaCard`
- `ContinueWatchingCard`
- `FloatingSurface`
- `AdaptiveOverlay`
- `SectionHeader`

Shared primitives in production code:

- `components/ui/designSystem.ts` for shared spacing, radii, typography,
  surface tone, status tone, and overlay tokens. Use this before adding local
  hardcoded control geometry.
- `components/ui/AppButton.tsx` for primary, secondary, ghost, and danger
  actions with consistent sizing, icon support, loading state, and accessibility
  state.
- `components/ui/Surface.tsx` for semantic bordered/elevated panels.
- `components/ui/StatusPill.tsx` for bridge/playback/download readiness labels.
- `components/ui/TextField.tsx` for themed form inputs.
- `components/ui/SearchField.tsx` for the canonical search icon, focus line,
  loading, clear action, and inline keyboard shortcut used by Search and the
  Command Palette.
- `components/ui/MediaArtwork.tsx` for resilient remote poster, backdrop, and
  logo rendering: cached `expo-image` loading, recycled-source protection,
  reduced-motion-aware transitions, and one token-based fallback treatment.
- `components/ui/ContentTabs.tsx` for quiet peer-view navigation such as All,
  Movies, and Series. It intentionally uses text and a selected underline
  instead of filter pills.
- `components/ui/MediaRail.tsx` for shared Home and provider catalog rails,
  including bounded scroll offsets, complete end spacing, disabled end arrows,
  keyboard/pointer controls, and subtle edge fades.
- `components/ui/SelectionActionBar.tsx` for Library and Downloads bulk mode.
  Its destructive actions use the shared seven-second undo scheduler rather
  than permanent inline delete-all controls.
- `components/ui/PlaybackStatusPanel.tsx` for centered player readiness and
  error states with consistent status pills and actions.

These primitives now underpin Settings, Search, catalog, detail, downloads,
auth/onboarding, and player recovery surfaces. New UI should reuse them before
adding another local button, switch, card, input, or page-layout style.

The detail-screen action hierarchy now uses `DetailActionPanel` to keep **Play**
primary for movies, keep series playback on episode rows, and keep Download,
**Cast to device**, **Watch trailer** (when safely declared by a provider), and
**Add to Library** as secondary actions.

The downloads queue now uses `AppButton`, `StatusPill`, and
`SelectionActionBar` for compact landscape rows, deferred bulk deletion, summary metrics,
and verified-offline status. Smart Downloads preferences live only in Settings;
Downloads shows one compact status row and its read-only planned queue. Each
intent carries its requested quality, and Wi-Fi/storage policy blocks are
shown inline without implying that a background download completed.

PR #116 tightened the pilot by moving `Surface`, `AppButton`, `StatusPill`,
settings grouping, `PlaybackStatusPanel`, `DownloadQueueCard`, and the desktop
cast dialog toward shared spacing/radius/type tokens. The goal is consistency
and lower styling drift, not a full visual migration.

Do not do:

- Do not reintroduce neon styling, dense glassmorphism, or a light-only identity.
- Do not use a fixed brand accent, pills, borders, or elevation as decoration
  on every element.
- Do not expose raw source complexity as the primary detail-screen flow.
- Do not add a marketing landing page instead of improving the actual app
  screens.
- Do not merge meaningful UI changes without desktop and phone screenshot QA.

Visual QA is risk-based: use compact (390×844) and large (1440×1000) for
reviewed pixel baselines, and medium (768×1024) plus expanded (1024×768) for
semantic geometry, overflow, and breakpoint assertions. Review Settings,
Account, Add-ons, Sources, Downloads, Notifications, Command Search, profile
menus, and form overlays on rendered builds before refreshing any snapshot.
Passing pixel comparisons is not a substitute for that design-convergence
review. Keep Darwin and Linux baselines independent.

---

## 2. Theme System

### 2.1 Palette (`constants/theme.ts`)

The entire colour system is defined in a single `PALETTE` object with two variants:

| Token                 | Dark                     | Light                    | Usage                           |
| --------------------- | ------------------------ | ------------------------ | ------------------------------- |
| `background`          | `#08090B`                | `#F3F2EF`                | App canvas                      |
| `surfaceSubtle`       | `#0D0F12`                | `#F8F7F4`                | Quiet raised region             |
| `card`                | `#111318`                | `#FFFFFF`                | Contained surfaces              |
| `surfaceElevated`     | `#181B21`                | `#E9E8E4`                | Sheets and elevated controls    |
| `surfaceOverlay`      | `rgba(17,19,24,0.96)`    | `rgba(255,255,255,0.97)` | Readable overlays               |
| `text`                | `#F4F2EE`                | `#101216`                | Primary text                    |
| `textSecondary`       | `#B8B5B0`                | `#656B75`                | Labels and supporting copy      |
| `textTertiary`        | `#85848A`                | `#85868B`                | Tertiary metadata               |
| `tint`                | `#C89B6D`                | `#8A5A35`                | Warm fallback selection/accent  |
| `onTint`              | `#08090B`                | `#FFFFFF`                | Content on accent surfaces      |
| `primary`             | `#F4F2EE`                | `#101216`                | Neutral primary actions         |
| `onPrimary`           | `#08090B`                | `#FFFFFF`                | Content on primary actions      |
| `focus`               | `#D6AA7C`                | `#7A4C2E`                | Visible keyboard focus fallback |
| `border`              | `rgba(244,245,247,0.09)` | `rgba(16,18,22,0.09)`    | Dividers and boundaries         |
| `opaqueGlassFallback` | `#111318`                | `#FFFFFF`                | Reduced-transparency fallback   |

Status, scrim, disabled, and overlay tokens are also semantic. New components
must consume tokens instead of inferring foreground contrast from `isDark`.

### 2.2 `useTheme()` Hook

Every themed component calls `useTheme()` which:

1. Reads `themePreference` from `authStore` (`"system"`, `"dark"`, or `"light"`).
2. Falls back to `useColorScheme()` (the OS setting) when preference is `"system"`.
3. Returns `{ isDark, colors, themePreference }`.

**Intricacy:** Styles that depend on `isDark` or `colors` must be computed inside the render function — either as a `useMemo(() => StyleSheet.create(...), [colors, isDark])` (pattern used in `player.tsx`) or via inline style objects. Static `StyleSheet.create()` at module level cannot reference theme tokens because `StyleSheet.create` runs once at module load time, before any theme is known. The player screen demonstrates the correct pattern.

### 2.3 Accent Foreground

Primary controls use `colors.onTint` through `getAccentForeground(colors)`.
Do not derive primary-button text from dark/light mode; contrast belongs to the
palette contract.

### 2.4 Cinematic Theme Ownership

`CinematicThemeProvider` layers optional artwork-derived ambience beside the
normal `ThemeColors`; it never replaces the application theme. The source order
is backdrop, poster, then the warm Streamer fallback. Extraction runs
asynchronously behind `CinematicPaletteExtractor`, so the first render is
always immediate and a failed/CORS-blocked image is never an error state.

`CinematicThemeRepository` coalesces concurrent requests and keeps at most 128
versioned entries in memory and AsyncStorage. Keys contain content identity and
a URI hash, never the raw artwork URL. Extraction failures are cached for 24
hours to prevent retry loops. The provider dispatches
`cinematic-theme-ready` after fallback or extraction resolves so deterministic
visual fixtures can wait without coupling to implementation timing.

Home follows the active hero and lets ambience fade with scroll; Detail fixes
the selected item's theme. Theme sources register only while their route is
focused, so retained Expo Router tabs cannot leak Home or Detail ambience into
neutral Library, Search, Settings, or Downloads presentations. Cinematic page
ambience is limited to Home and Detail: those routes may use `ambient`,
`ambientMuted`, `glow`, artwork scrims, accent, focus, and progress. Catalog
surfaces stay page-neutral, although an individual media item may use its own
restrained progress, keyboard-focus, or selected-state accent. Player uses only
media-local accent/progress/focus; utility surfaces stay fully neutral. Dynamic
artwork colour is a persisted Appearance preference and defaults on. Text
always uses `ThemeColors`; derived colour is limited to the roles above. While
a new artwork palette resolves, the provider retains the previous media palette
instead of flashing through the fallback. Colour-bearing hero layers use the
shared motion timing for a soft crossfade; Reduce Motion removes spatial
movement without making extraction a rendering dependency.

---

## 3. Cross-Platform Layout Strategy

The app targets iOS, Android, browser web, Electron, and resizable tablet/foldable
windows from one codebase. Layout decisions use window size, not device labels.

### 3.1 Navigation Shell

| Window class | Width      | Navigation                               |
| ------------ | ---------- | ---------------------------------------- |
| `compact`    | `< 600`    | Four-item bottom tab bar                 |
| `medium`     | `600–839`  | 68–72 px horizontal topbar               |
| `expanded`   | `840–1199` | Topbar with Streamer name                |
| `large`      | `≥ 1200`   | Topbar plus visible Search shortcut hint |

`useWindowClass()` is the shared classification contract. `DesktopLayout` and
the tabs use the same result, keeping bottom navigation and the desktop topbar
mutually exclusive during resizing, split screen, and foldable transitions.

`CinematicTopBar` contains Streamer at the left, Home/Library/Downloads in the
middle, and Search/Notifications/Profile at the right. Search opens the same
controller from its icon or `Command/Ctrl+K`; the former global `/` shortcut is
intentionally removed. Home and Detail start with an overlay topbar and gain a readable
translucent surface plus a subtle divider while scrolling. `DesktopLayout`
owns that scroll signal and keeps the topbar outside the route scroll viewport,
so content can pass underneath without covering navigation. Medium density
compresses the fixed brand/action zones; Mobile Detail's floating back action
sits below the global topbar at that class. Utility routes
start opaque. Player, auth, and
onboarding remain immersive. Electron uses real macOS hidden-inset traffic
lights and an explicit drag/no-drag region; browser never imitates window
controls and Windows/Linux retain the system frame.

Content boundaries use semantic roles rather than route-local max widths:

| Role            | Maximum | Intended surfaces                                |
| --------------- | ------: | ------------------------------------------------ |
| `cinematic`     | 1560 px | full-bleed Home and Detail composition           |
| `catalog`       | 1560 px | Search and Library grids/rails                   |
| `utilityWide`   | 1120 px | Settings and Downloads                           |
| `utilityNarrow` |  760 px | Account, Notifications, forms, and reading flows |

Window-class gutters remain shared: 20 compact, 24 medium, 40 expanded, and
56 large. Routes must select a role through `ContentBoundary` or
`AdaptiveRoutePage` instead of inventing another width and margin pair.

### 3.2 Responsive Grid (Shared Window Class)

Catalog grids derive their columns from the same window class: compact 2,
medium 3, expanded 4, and large 6. Avoid introducing local breakpoint buckets
for core screen structure.

Library is the deliberate exception because card readability is width-driven:
it measures the available content boundary and uses fixed `PosterCard` widths
without `flex: 1`. It renders 2 columns compact, 3 medium, 4-5 expanded, and
5-7 large with 16 px gaps and a desktop target near 198 px. Library and Download
view keys use stable library-row and download-task identities; download task IDs
encode episode identity, so episodes from one series remain independently
selectable. Empty filters do not expose Select; filter changes and Cancel clear
selection.

**Intricacy:** `FlatList` requires a `key` prop change when `numColumns` changes (e.g. `key={`grid-${numColumns}`}`). Without this, React Native throws a warning and the grid does not re-render correctly. This is done correctly in the home screen but is a common pitfall when adding new grids.

### 3.3 Adaptive Hero And Home Feed

`HomeHeroBanner` renders on compact through large windows as a full-bleed,
square-corner composition: roughly 420–520 px compact, 500 px medium,
520–680 px expanded, and 60–68 viewport-height units (560–760 px clamped) on
large windows. The most recent Continue Watching item owns the hero
when it also exists in the active catalog; otherwise the normal featured choice
is used. That hero item is removed from Continue Watching to avoid duplication.

A valid landscape backdrop is sharp and dissolves into the canvas through
left/bottom scrims. If no backdrop exists, a 2:3 poster is contained on the
ambient canvas. If all artwork is absent, use the cinematic gradient fallback.
Do not blur the primary artwork or crop a poster to 16:9.

At 15 seconds or more saved progress the neutral primary action reads **Resume**
and carries a runtime-only `PlaybackLaunchIntent` to seek directly without a
second resume prompt. Earlier progress reads **Play**. Both actions use the
existing planner/session flow; **View details** is secondary.

`buildHomeFeed()` claims content using canonical `type:id` keys so the hero,
Continue Watching, and primary rails do not repeat the same title. Generic
catalog order is presented only as neutral **Movies**, **Series**, and **More to
Watch** rails. It must never be relabeled as Popular, Trending, Top, New, or
Recently Added unless the providing catalog explicitly supplies that semantic.

---

## 4. Component Library (`components/ui/`)

These are the foundational building blocks used across all screens.

This is an app-local component library, not a separate workspace package. That
is deliberate: mobile, web, and Electron currently render the same Expo app,
while these primitives depend on app hooks such as `useTheme()` and
`useWindowClass()`. `@streamer/shared` remains reserved for runtime-independent
types and contracts. A separate `packages/ui` becomes useful only when a second
renderer needs the same components without importing the Expo application.

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

The exported functional wrapper reads `useTheme()` and injects semantic colours
into the class-based boundary. The fallback therefore follows light/dark mode,
uses the neutral primary action, and exposes a visible web focus ring without
putting hooks inside the error-boundary class.

### 4.4 `FilterChipBar`

A horizontal scrollable row of toggle chips. Used for genuine compact facets
and status filters such as Downloads queue state and secondary Search filters.
Implemented with `ScrollView horizontal` — not `FlatList` — because these
option lists are small and known.

Do not use `FilterChipBar` for top-level content destinations. Search and
Library use `ContentTabs` for All, Movies, and Series, so selected state reads
as navigation rather than a row of oversized buttons.

### 4.5 `ContentTabs`

Quiet navigation for peer content views. Every tab keeps a 44-pixel target and
exposes the selected state to assistive technology. The underline variant uses
a two-pixel semantic accent indicator; the compact segmented variant groups
short view choices inside one restrained surface. The accent is never
hardcoded. Search uses the segmented treatment for
All, Movies, and Series only after a query is submitted; Library keeps the
editorial underline. Both share the same primitive and interaction contract.

### 4.6 `SearchField`

The canonical themed search input. It owns search icon placement, focus
treatment, loading state, clear action, placeholder behaviour, and the optional
inline platform shortcut hint. Its underline and compact surface variants share
the same interaction contract. Search uses one prominent, bounded surface field
at the top of the content column and keeps it left-aligned with the page copy;
`CommandPalette` keeps the editorial underline.

`components/search/RecentSearches.tsx` complements the input with page and
compact variants. It renders a restrained divided list rather than a card or
chip cloud and is shared by Search and the Command Palette.

### 4.6.1 `MediaArtwork`

`MediaArtwork` is the shared remote-artwork boundary for `PosterCard` and the
detail layouts. It accepts poster, backdrop, and logo variants and owns URI
normalisation, `expo-image` memory/disk caching, recycling keys, source-change
loading state, reduced-motion-aware transitions, and a quiet title/icon
fallback. Use it instead of adding another per-screen `Image` error handler.

It does not convert provider artwork into a recommendation signal or retain
provider URLs outside the rendered view. A fallback means the image was absent
or failed to load; it is not evidence that the title itself is unavailable.

### 4.7 `OfflineBanner`

Polls `expo-network` for connectivity and shows a persistent top banner when
offline. The shell places it below the active topbar or compact safe-area
header, so it does not cover navigation and does not block cached content.

### 4.8 `WatchProgressBar`

A thin horizontal progress bar rendered below catalog cards to indicate watch progress. Reads from the `WatchProgress` data returned by `useContinueWatching`.

### 4.9 `CommandPalette`

A keyboard-driven search overlay (web/desktop), triggered by its topbar icon,
`⌘K` on macOS, or `Ctrl+K` on Windows/Linux. The former global `/` shortcut is
intentionally a no-op; mobile uses the Search tab. It renders recent searches
and at most six live, keyboard-selectable suggestions using the same controller,
endpoint mode, ranking, and persistence as `/search`. Enter opens a highlighted
title only after deliberate arrow-key navigation; otherwise it opens the
canonical `/search?q=...` results route. The final row exposes the
provider-reported result count when it is known, rather than presenting a second
anonymous Search action. Escape closes the overlay and focus returns to the
exact trigger that opened it.

### 4.9.1 Unified Search Screen

`app/(tabs)/search.tsx` is the single `/search` destination.
`/search/results?q=...` remains a compatibility route for existing callers and
older result links. The old Discover tab redirects to `/search`; Home remains
the primary personalised discovery destination.
The screen provides:

- a sticky, editable, left-aligned search input at the top of every window class
- an empty-query discovery landing with compatible installed-provider catalogs,
  their declared names, a compact **Content type** selector, and recent searches
  beneath it; it never fabricates Popular, New, or availability rails
- debounced poster/title suggestions from two characters, capped at six by the
  server, plus an explicit all-results row
- cancellable suggestion and result requests with separate timeout budgets
- partial-provider, bounded-result, retryable error, no-searchable-provider,
  and no-results states; internal truncation is not presented as a provider
  outage
- shareable/restorable query, type, year, provider, and sort URL state
- a compact segmented type selector (`All`, `Movies`, `Series`) shown only for
  submitted results
- labelled year/provider/sort controls behind one compact **Filters** action;
  `AdaptiveOverlay` presents them as a popover, floating sheet, or bottom sheet
- no persistent filter sidebar; result artwork keeps the available catalog width
- a responsive 2:3 poster grid for submitted results

The empty-query browse landing reads add-on manifest catalog metadata locally;
it shows only movie/series catalogs that the current catalog endpoint can fetch
without unspecified required extras and whose provider does not still require
configuration. Stream-only and setup-required providers remain visible in
Add-ons but do not create empty browse rails. The landing is capped at six rows
and preserves installed-provider names. `/api/search` validates query, type, mode, limit, and
cursor. It fans out only to
movie/series catalog definitions that explicitly declare the Stremio `search`
extra, ranks normalized title matches deterministically, merges provider
provenance, and returns a bounded page. Type is a server search parameter;
year/provider/sort remain secondary client refinements because add-on metadata
is not uniform enough to make those reliable backend facets. Do not infer genre,
language, or playback availability from labels, and do not expose source picking
as the primary search UX.

### 4.9.2 `FloatingSurface` and `AdaptiveOverlay`

`FloatingSurface` owns semantic material levels exactly as `menu`, `sheet`, or
`media`. It owns background, border, radius, shadow, supported translucency, and
the opaque fallback. Topbar/navigation remains a separate functional material
policy and is not forced through `FloatingSurface`.

Sheets prioritize readability and may resolve to opaque or near-opaque depending
on platform, available translucency support, content complexity, and
accessibility preferences. Reduce Transparency always selects the opaque
fallback; Android remains opaque when reliable native blur is unavailable. No
route-local blur values or new blur dependency belong in feature components.

`AdaptiveOverlay` owns the generic modal shell, backdrop, safe areas, focus trap
and return, Escape, modal semantics, and breakpoint presentation. Large/expanded
use popovers, medium floating sheets, and compact bottom sheets. Feature
components retain their content and interaction contracts.

`CommandPalette` is the deliberate exception to generic feature geometry:
AdaptiveOverlay provides infrastructure, while CommandPalette owns its
top-center placement, max width, fast transition, autofocus, arrow-key result
selection, result composition, recents, loading/no-result states, and View all
row. The two layers must produce one effective visible animation rather than
compounding transforms or opacity.

### 4.10 `DesktopLayout`

See Section 3.1 above. It is the only owner of medium-through-large global
navigation. Do not render a route-local sidebar beside it. `AdaptiveOverlay`
is the shared presentation owner for temporary actions: large/expanded use an
anchored popover, medium a floating sheet, and compact a bottom sheet. It owns
Escape, outside press, focus trap/return, modal semantics, and reduced-motion
presentation. The web focus trap queries the current overlay descendants on
every Tab event, so content swaps such as Player Settings → Diagnostics cannot
leave stale focus targets behind.

### 4.11 `BiometricLockOverlay`

An overlay that gates access to the app behind biometric authentication using `expo-local-authentication`. Activated on app foreground if enabled in settings. Renders over the entire screen using `position: absolute` fill.

---

## 5. Catalog Components (`components/catalog/`)

### 5.1 `CatalogItemCard`

The data/router adapter around `MediaCard`. It renders the canonical poster
presentation, title, and optional progress while preserving navigation and
haptic behaviour.

The card uses `aspectRatio: 2/3` (standard movie poster ratio) to ensure consistent sizing regardless of image dimensions.

**Intricacy:** Poster images come from external add-on APIs and have
unpredictable dimensions and CDN availability. `CatalogItemCard` now trims
poster URLs, resets image-error state when a refetch supplies a poster, uses
`expo-image` memory/disk caching, and falls back to a title card on image
failure. `PosterCard` and both detail layouts use the shared `MediaArtwork`
boundary for the same class of failure. If provider-named rails show
placeholders, debug whether the add-on catalog is returning empty or invalid
poster URLs before changing the card UI.

### 5.2 `ContinueWatchingRow`

A horizontal `FlatList` of in-progress content from `useContinueWatching`.
Home can request a useful empty state; Search and Library can keep the row
hidden when there is no progress. Cards prefer persisted 16:9 background
artwork. Legacy entries without a background use a contained 2:3 poster on an
ambient canvas rather than cropping it. The poster is anchored to an ambient
edge instead of being centred inside an opaque landscape card. Episode metadata and a thin progress
bar remain visible; Resume and More actions appear without a permanent button
row and stay separate keyboard/screen-reader stops. Width targets are
270/300/344/400 px across compact/medium/expanded/large, which yields roughly
three large cards in the desktop content boundary. Desktop pointer hover uses
a small 1.025 scale and reveals Resume/More; touch keeps the actions directly
reachable, and keyboard focus reveals them with the explicit focus ring. Hover
and focus ownership sit on the complete card boundary, so moving into those
revealed actions cannot dismiss them.
Trusted metadata/media durations show remaining time and percentage. Unknown
or migrated legacy durations show only “X min watched”; they remain resumable
but never imply completion. The remove action calls
`DELETE /api/library/progress` and only removes watch progress; it does not
delete the title from the user's library.

Resume is not a navigation shortcut: it creates the existing planner/session
flow and adds a runtime-only resume intent with the saved position before
opening the player. Failed planning remains visible as recoverable feedback;
the card's separate detail action still opens the title rather than promising
direct playback.

Avoid nesting `Pressable` or `AppButton` inside another `Pressable` in this
component. React Native Web renders those as nested `<button>` elements and
will warn in development.

### 5.3 `EpisodeSelector`

A compound component for TV show episode navigation. Displays a season picker (segmented control or dropdown) and a vertical list of episodes with runtime, watched state, and a play button.

**Known historical bug:** Duplicate `key` props were a source of React warnings when episode lists had entries with the same `id` field from different add-ons. Fixed by using a composite key `${season}-${episode}-${addonId}`.

### 5.4 `HomeHeroBanner`

Full-bleed hero image with a gradient overlay, title, metadata, and primary
actions. `HomeHeroBanner` is used at the top of Home on phone and desktop with
responsive sizing and Play/Resume launch intent. Discover and detail contexts
use their own catalog and detail components rather than a second hero variant.

PR #118 gave Home an initial hierarchy that is now refined to hero, Continue
Watching, neutral title-type rails, and genuine named provider rails. Home must
stay consumer-facing: do not expose source selection or add-on internals there.

---

## 6. Player Components (`components/player/`)

The player screen (`app/player.tsx`) is the most complex screen in the app. It was deliberately decomposed into sub-components to manage complexity, with logic extracted into custom hooks.

### 6.1 Component Composition

```
PlayerScreen (app/player.tsx)
├── VideoView (expo-video)          — native video renderer
├── MediaPlayerAdapter              — normalized media capability/event boundary
├── PlaybackRuntimeCoordinator      — transient discriminated view state
├── PlayerInteractionLayer          — passive tap/double-tap hit areas
├── PlayerOverlay                   — quiet top chrome and optional stream info
├── PlayerControls
│   └── PlayerTimeline              — pointer/touch/keyboard scrub and preview
├── ExternalSubtitleRenderer        — accepted-clock external subtitle overlay
├── PlayerSettingsModal             — adaptive Playback/Audio/Subtitles content
├── Player diagnostics utility      — separate inspect surface
├── PlayerStatusOverlay             — typed readiness/error state
├── NextEpisodeOverlay              — "Up Next: Episode X" auto-play prompt
├── RemoteControlBar                — Chromecast / AirPlay remote UI (when casting)
└── DesktopCastModal                — device selector modal for web/Electron
```

All of this playback chrome uses the dedicated `components/player/playerChrome.ts`
cinema-dark palette. It deliberately stays dark when the application is in
warm-neutral light mode, because arbitrary video frames require stable contrast.
Do not pull the normal page surface or primary-action colours into player
controls. The close bar, timeline tray, Settings sheet, resume prompt, and
next-episode prompt share that palette, visible keyboard focus, safe-area
spacing, and reduced-motion behaviour.

### 6.2 `PlayerOverlay`

The visible top chrome uses one compact Close control plus only available
platform actions. The settings action is anchored at the top-right and opens
the same `PlayerSettingsModal` content as a 340–380 px desktop popover, medium
floating sheet, or compact bottom sheet. Optional diagnostics are a separate
inspect surface, not a fourth settings tab.

`PlayerInteractionLayer` owns the passive left, centre, and right hit areas.
Taps toggle controls and double-taps on the outer areas seek ±10 seconds. These
hit areas are deliberately removed from keyboard and screen-reader navigation;
the same actions remain available through labeled controls and hotkeys. A
visual seek feedback indicator (`"+10s"` / `"-10s"`) resets its timer on
repeated taps.

### 6.3 `PlayerControls`

Renders the visible playback control surface. The current chrome keeps the
video dominant: the bottom treatment is a black readability gradient rather
than a large floating card, and source/status information shares a compact
toolbar with the available actions.

- Center controls with a 60–68 px high-contrast Play/Pause action and nearby
  42–48 px Skip ±10s controls.
- Bottom timeline with watched, buffered and playhead layers; the track is 4 px
  idle and 6 px while active, with at least a 32 px interaction zone.
- Pointer hover, pointer/touch drag and timestamp preview. Native targets use
  `expo-video` thumbnails where supported; web may use the active gateway
  job's bounded seekable-cache thumbnail route.
- Accessible progress control using `accessibilityRole="adjustable"`,
  current/total values, keyboard Home/End and ±10s seek actions.
- Capability-aware timeline copy for direct, seekable-cache, live progressive,
  remux, and unknown-duration playback.
- Desktop/web mute and continuous volume adjustment, settings, cast, retry, and
  fullscreen actions when those capabilities are available.
- Desktop/web keyboard shortcut helper for the currently supported hotkeys.
- Web pointer pass-through so the overlay can remain visible without blocking
  unrelated video-surface interactions.
- Evidence-gated Skip intro/recap/credits controls. No supplied segment means
  no control.

Controls auto-hide after 2.5 seconds during active desktop playback (3 seconds
compact). They remain visible while paused, scrubbing, settings are open,
keyboard focus is inside the chrome, or a screen reader is active. Reduced
Motion removes scale/spatial transitions without removing state feedback.

Playback settings expose rates `0.5`, `0.75`, `1`, `1.25`, `1.5`, and `2` plus
the existing exact quality allowlist. `Auto` selects all supported qualities;
individual 4K/1080p/720p/480p tiles toggle the same persisted set and the final
quality cannot be removed. A quality edit only affects the next planning or
playback request and never swaps the active stream.

PR #117 routes button, scrubber, accessibility, and desktop hotkey seeking
through the same guarded callbacks. Keyboard shortcuts must not bypass
`canSeekPlayback` or seek while a source is live, unknown-duration, or otherwise
marked non-seekable. Primary progressive fMP4 Play begins in that disabled live
state: controls describe it as a live-compatible stream and, while applicable,
honestly state that seek controls are being prepared. Once the gateway's
background cache is ready and the replacement source has actually loaded, the
same guarded controls become available. If that optional cache is unavailable,
live playback continues and the timeline remains disabled; no UI copy promises
that seeking will definitely unlock.

The replacement preserves both the current position and explicit pause state.
An optional handoff failure only changes the seekability state; it never
silently starts a fallback while the existing video remains playable.

Thumbnail previews are progressive enhancement. The timeline requests coarse
ten-second buckets only after hover or drag begins, retains at most 24 client
entries and cancels an obsolete bridge request when a new bucket wins. Direct
or cross-origin media without a safe frame path continues to show the target
timestamp; absence of an image never disables or delays seeking.

### 6.4 `usePlayerHotkeys`

Extracted hook for keyboard shortcuts on web/desktop. Handles:

| Key           | Action                                                   |
| ------------- | -------------------------------------------------------- |
| `Space` / `K` | Play/Pause                                               |
| `J` / `←`     | Seek back 10 seconds                                     |
| `L` / `→`     | Seek forward 10 seconds                                  |
| `Shift+←/→`   | Seek back/forward 30 seconds                             |
| `F`           | Toggle fullscreen                                        |
| `M`           | Toggle mute                                              |
| `C`           | Toggle subtitles                                         |
| `0`-`9`       | Jump to 0%-90%                                           |
| `Escape`      | Close a player sheet or cancel active source preparation |

All listeners are added to `window` (web only — guarded by
`Platform.OS === "web"`). Listeners are cleaned up in the `useEffect` return to
avoid leaks.

Seek shortcuts should use the callback props from `PlayerScreen` rather than
mutating `player.currentTime` directly when a guarded callback is available.
Escape follows a strict priority: close Player Settings, then close the Cast
dialog, then cancel active source preparation. It does not silently leave
normal playback.

### 6.5 Progress Reporting

The player reports the last position accepted by `PlaybackProgressClock` every
`15_000` ms (`PROGRESS_REPORT_INTERVAL`) via `useUpdateProgress`. Only player
`timeUpdate` events and explicit seek/resume intents advance that clock.
Source-replacement resets and unexplained jumps are ignored. Pause,
backgrounding, close/unmount flush the last accepted position, with duplicate
writes suppressed.

Progress duration carries a trust source. Direct, HLS-VOD, and fully seekable
media may use `media`; catalog runtime uses `metadata`; a progressive remux
without catalog runtime uses `unknown` with `duration: 0`. The player's growing
progressive-fMP4 duration is never persisted.

**Intricacy:** The `useTraktScrobbler` hook fires independently from this interval, using the player's local state. The two are not synchronised — Trakt scrobbles can arrive at the server slightly before or after the watch progress update. This is acceptable for the use case but means `lastWatched` timestamp in the database and the Trakt scrobble timestamp may differ slightly.

### 6.6 Runtime Readiness States

The player no longer treats every loading problem as generic `Buffering...`.
`playerStore` tracks typed `runtimeState` and `runtimeError` values from `@streamer/shared`.

Important visible states:

| Runtime state               | UX meaning                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `planning`                  | The player opened immediately and is searching for a playable source.                       |
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

During gateway preparation, the status message must describe a concrete phase
or peer state (for example, finding peers, reading metadata, checking whether
playback can start, or preparing a compatible stream). Do not render the
gateway's elapsed readiness time as a percentage. A percentage is reserved for
actual media/download progress once byte-level metrics exist.

For primary progressive fMP4 playback, a real first consumer starts an optional
background seekable-cache evaluation and preparation. Evaluation checks source
size, available storage, and active download progress. The player may show a factual
"preparing seek controls" state, but never presents it as media progress or a
guaranteed upgrade. When the cache is ready, the player replaces the source via
the same signed gateway route, restores the current position and prior playback
choice only after the replacement reports readiness, and then enables normal
range-backed seeking. If the cache becomes unavailable, the live response stays
on screen and only seeking remains disabled.

Source preparation is cancellable as soon as it is active. The loading overlay
shows a dedicated Cancel control; on web/Electron, Escape triggers the same
session/engine cancellation path. Closing or cancelling without a planner
session also stops the resolved engine before leaving the player. A missing
stream is presented through `PlaybackStatusPanel` with Browse titles and Back,
not as an isolated error string.

The initial planning stage follows the same rule: Play navigates immediately to
the player with a runtime-only launch intent, which shows **Searching for a
playable source** within the normal player surface. Escape, Close, and Cancel
abort that foreground request, clean up any provisional session, and suppress
late results after navigation. Detail prefetch never turns a user cancellation
into a background-owned playback attempt.

Torrent preparation itself is cancellation-aware. Each operation has an
`AbortController` and generation guard, so cancelling interrupts the bridge
request, an active status poll, or the delay before the next poll without
waiting for the gateway timeout. A job returned late by a bridge that ignored
the abort is deleted best-effort. Expected cancellation remains a cancelled
session: it does not create an attempt failure, start a fallback, or degrade the
remembered bridge status.

After real playback begins, a one-shot stall watchdog observes actual playhead
or buffered-edge movement. Fifteen seconds without either signal can enter the
existing **Trying another source** state and use the normal serial fallback.
It is deliberately suppressed while playback is paused, the app/player is not
visible, the user is seeking, preview controls are open, casting is active, or
a fallback is already running. That makes a stalled source recoverable without
mistaking an intentional pause or interaction for a failure.

### 6.7 Audio And Subtitle Experience

The Settings inspect sheet consumes one normalized catalog. Audio labels
combine language, channel layout and accessibility role; commentary and audio
description are not treated as ordinary main audio. Subtitle rows identify
embedded, included-file and add-on origin without exposing provider URLs.

External subtitle documents are bounded and sanitized, then rendered above the
video from the accepted playback clock. Styling preferences cover text size,
shadow/box/none, box opacity, vertical position, a small accessible font set,
sync offset and reset-to-defaults. The overlay respects safe-area and visible
control offsets. External subtitles are not claimed inside native PiP.

Automatic selection is deterministic. It considers explicit selection,
language, forced status, release/file/content evidence, SDH preference,
provider order and confidence. A weak first provider result does not
automatically turn captions on. See
[docs/PLAYER_ARCHITECTURE.md](./docs/PLAYER_ARCHITECTURE.md).

---

## 7. Detail Screen (`app/detail/[type]/[id].tsx`)

The detail screen fetches:

1. **Metadata** (`useMeta`) — title, poster, backdrop, description, cast, genre, rating.
2. **Streams** (`useStreams`) — all available streams from add-ons that support the content type/id.
3. **Library status** (`useLibrary`) — whether the item is already in the user's library.
4. **Watch progress** (`useContinueWatching`) — resume position.

For series, it additionally renders the `EpisodeSelector` component to let the user pick a season and episode, then fetches streams for that specific episode via `useEpisodeStreams`.

Desktop Detail is one full-bleed scroll composition. A sharp backdrop occupies
roughly 58–68% of the viewport with strong left and bottom scrims; title,
metadata, synopsis, actions, and the optional 200–240 px poster sit lower-left.
The body begins below the hero: series allocate roughly two thirds to episodes
and one third to metadata, while films use the released episode space for story
and details. Metadata never competes as a third top-level hero column. Compact
keeps `MobileDetailLayout`, edge-to-edge artwork, and bottom-sheet source
presentation.

**Primary flow:** The visible action is **Play**. Detail starts a shared plan
prefetch after 600 ms of idle time (and on desktop Play hover/focus), then
creates a runtime-only planning intent and opens the player immediately. The
player calls the internal `PlaybackOrchestrator.playBest()` through that same
in-flight plan, resolves only the selected source, and passes remaining planned
fallbacks into `playerStore`. Bridge detection runs once alongside plan lookup,
not as a second serial wait.

**Provider-declared trailers:** `MetaDetail.trailers` is optional provider
metadata. A secondary **Watch trailer** action appears only when
`getSafeTrailerUrl()` accepts a YouTube video ID or an HTTPS URL on an
allowlisted YouTube host. Opening it uses the platform link handler and shows
recoverable feedback if no handler is available. Do not render arbitrary
provider URLs or treat a missing trailer as a title/playback failure.

**Advanced source display:** `More Sources` is closed and unplanned by default.
Expanding it lazy-loads one consumer-facing `SourceChoice` list with reliable
quality, size, language, and compatibility status. Choosing a candidate sends
its candidate ID through the existing planner/session resolver; it never
bypasses that contract with a direct URI. Ranking, codecs, rejected candidates,
bridge/remux data, and reason codes live behind the separately lazy **Show
technical details** disclosure.

The initial stream-card list can be marked `partial` while compatible add-ons
are still completing in the background. The UI keeps usable cards visible and
does one bounded follow-up fetch instead of treating that state as zero results
or keeping it stale for the normal two-minute card cache. If every candidate in
a partial playback plan fails, the player makes one bounded automatic replan;
it only replaces the session for a newly discovered candidate and otherwise
shows the normal recoverable actions.

Metadata loading and recovery are separate visible states. `useMeta` classifies
a confirmed `404`/no-provider result, a connection failure, and a temporary
request failure. `DetailLoadState` supplies Back and Retry in every recovery
case, with **Review add-ons** for unavailable metadata and **Sources & Devices**
for recoverable service/setup failures. Confirmed 404 responses are not retried
automatically. A previously cached full `MetaDetail` remains visible when a
background refresh fails; a lightweight catalog preview is not promoted to
full detail data.

The aggregator preserves that distinction: no metadata provider, or only
explicit provider 404 responses, produces a 404; total network, timeout, policy,
or schema failure produces the recoverable
`METADATA_TEMPORARILY_UNAVAILABLE` 503 response. A valid provider response still
wins during partial failure. This prevents an add-on outage from being shown as
if the title did not exist.

### 7.1 Personal activity: Library, history, and notifications

Library remains a record of saved membership, not a record of every title a
person has watched. Its **History** tab is a separate, cursor-paginated view of
watch-progress records, including completed movies and episodes. History
entries use their own stable identity so episodes from the same series can be
removed independently. Removing one entry or clearing history deletes only
watch progress after confirmation; it never removes Library membership or
offline files. The normal selection bar is unavailable in History, and
Continue Watching is hidden there to keep the two concepts distinct.

The notification route is a personal inbox rather than a toast archive. It
groups the server's newest-first, bounded notification list into Today, This
week, and Earlier; unread rows can be marked read individually, and the header
can mark all unread rows read. Both actions optimistically update the local
query cache, restore it after an error, and expose a retry state. Notifications
currently have no trusted content target, so a row changes read state only; do
not invent a deep link from its message text. On desktop the topbar bell first
opens a compact, soft-backdrop popover containing the latest four items and a
**View all** route action. Compact presentation continues to use the full
Notifications route.

---

## 8. Settings Screen (`app/(tabs)/settings.tsx`)

Settings is a routed information architecture with an adaptive dashboard. Its public
section contract is `account`, `playback`, `downloads`, `sources`,
`appearance`, `privacy`, `about`, and `advanced`.

- `/settings` shows profile, one compact consumer readiness summary, and the
  category overview on compact.
- Medium through large render the same Appearance, Playback, Downloads, and
  Account & Sources content within a 1120 px boundary. The dashboard resolves
  two columns only when the available inner width satisfies
  `availableWidth >= 2 * settingsColumnMinWidth + settingsColumnGap`; otherwise
  it uses one column. The current readability tokens are a 360 px minimum
  column and 32 px gap, and the resolver is tested at 768, 1024, and 1440 px.
  There is no settings sidebar.
- `/settings/[section]` shows exactly one category. `/sources` redirects to
  `/settings/sources` so existing bookmarks and recovery actions stay valid.
- Deep links and recovery routes remain valid on every class; medium-through-
  large show one centered detail without a second navigation bar.
- Account owns profile, Trakt, sessions, password, and sign-out. Playback owns
  quality, autoplay, audio, and subtitle preferences. Downloads owns Smart
  Downloads, network/quality/storage policy, cleanup, and the queue shortcut.
- Sources & Devices presents general readiness, Content Add-ons, Local Playback
  Service, and Casting & Devices from the shared playback-environment model.
  Advanced exclusively owns server/LAN/pairing values, re-check/restart/repair,
  cache cleanup, diagnostics export, and collapsed technical details. It does
  not duplicate the general Ready-to-play card.
- Appearance owns theme, dynamic artwork colour, forced Reduce Motion, and
  language. Privacy owns biometric unlock, export,
  and a separate danger zone. About owns version, links, and the one desktop
  update control when available. Streamer app, Desktop shell, Electron runtime,
  Build SHA, and Channel are separate labeled rows; an unstamped local SHA reads
  `Not stamped (development)`.

Appearance language choices use scalable radio rows with endonyms and a
checkmark, not flag glyphs. Regional locale values such as `en-US` normalize to
their supported base language.

The category rows use `SettingsNavRow`; actions, switches, and discrete choices
use `SettingsActionRow`, `SettingsToggleRow`, and `SettingsChoiceRow`. Every
interactive row has a minimum 44 px target, keyboard focus, selected/pressed
state, and translated labels. Avoid duplicating a setting in the overview and
its detail page.

Smart Downloads stays opt-in and disabled by default. HLS offline limitations
and planned-next-episode intents must never be presented as completed offline
files. Policy-blocked next-episode intents must expose the reason (for example,
waiting for Wi-Fi or reaching the storage limit) and remain read-only. A
download is Ready offline only after managed-path type/size checks,
reliable Content-Length comparison, metadata rejection, and a successful local
`expo-video` readiness/duration probe. Existing completion records migrate to
pending verification. Playback quality is always passed to the internal
`playBest()` planner as an exact allowlist of the selected 2160p, 1080p, 720p,
and 480p values. Unselected, SD, and unclassified qualities are rejected before
ranking with the internal `quality_not_allowed` reason, including when all four
selectable qualities are enabled. The final selected quality cannot be removed.
Persisted legacy maximum-quality choices migrate to equivalent quality sets.
Audio and subtitle choices remain player preferences until richer track
selection is available.

When every available source is excluded only by this allowlist, the planner
reason survives as `quality_not_allowed`. Detail then explains the quality
conflict and links directly to **Playback settings**. Mixed quality and device
compatibility failures retain the broader **Sources & Devices** recovery.

The Trakt OAuth flow uses `expo-web-browser` to open the Trakt authorization
URL, then captures the redirect via deep link.

First-run onboarding now includes a setup checklist before theme/add-on
selection. It explains sources/metadata, desktop bridge, downloads/cast, and
privacy at a product level. Do not add Real-Debrid to onboarding; it remains an
optional paid resolver configured later.

### 8.1 Utility containment review

Utility routes use a neutral Streamer theme, not artwork-driven page ambience.
They should still retain meaningful visual differentiation for status, focus,
selection, hierarchy, and interaction ownership. Every proposed flattening is
reviewed with the same three questions:

1. Is containment semantically necessary?
2. Can spacing or separators establish the same hierarchy?
3. Would removing the surface make interaction ownership less clear?

Remove a surface only when it is decorative containment. Preserve surfaces for
grouping, modality, status, selection context, destructive scope, diagnostics,
installation/setup ownership, and error or warning recovery. In particular,
Add-on setup, account security, download recovery, diagnostics, and warnings
must not be flattened mechanically.

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

| Hook                                         | Query key                                         | Purpose                                                  |
| -------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `useAddonCatalog(addonId, catalog, search?)` | `["catalog", "addon", addonId, type, id, search]` | Fetches a paginated catalog row from an installed add-on |
| `useMeta(type, id)`                          | `["meta", type, id]`                              | Fetches detail metadata                                  |
| `useStreams(type, id)`                       | `["streams", type, id]`                           | Fetches available streams                                |
| `useLibrary()`                               | `["library"]`                                     | User's saved items                                       |
| `useContinueWatching()`                      | `["progress", "continue"]`                        | In-progress items (watch progress)                       |
| `useWatchHistory()`                          | `["progress", "history", 24]`                     | Cursor-paginated personal history                        |
| `useAddons()`                                | `["addons", userId]`                              | Signed-in user's installed add-ons                       |
| `useNotifications()`                         | `["notifications"]`                               | In-app notifications                                     |
| `useSessions()`                              | `["sessions"]`                                    | Active device sessions                                   |

**Authentication interception:** `services/api.ts` has an Axios response interceptor that catches `401` responses, attempts a single-flight token refresh via `POST /api/auth/refresh`, and retries the original request. Only an explicit invalid, expired, revoked, or replayed refresh response logs the user out. Network, timeout, rate-limit, temporary-service, and storage failures preserve the session and expose degraded session health so protected work can pause and recover. **Intricacy:** Refresh tokens rotate on the server, so a refresh request without a response is not blindly repeated; the client must not risk replaying a token that the server may already have consumed.

**Stale time:** Default stale time is React Query's default (0ms). This means navigating back to a screen with cached data shows it instantly but triggers a background refetch. For catalog data this is acceptable; for user library it means additions from another device are picked up quickly.

---

## 11. Future Improvement Suggestions

### High Priority

#### 1. Artwork Coverage and Native Performance

`MediaArtwork` now gives `PosterCard` and detail posters/backdrops one safe
remote-artwork loading and fallback contract. The next step is to migrate any
remaining standalone media image renderer only when it has the same remote
failure/recycling requirements, then profile long native rails before adding
more caching or placeholder assets. Do not replace a failed provider image with
an unrelated title image or use it as a content-availability signal.

#### 2. Pagination / Infinite Scroll in Catalog (Implemented)

`useAddonCatalog` uses React Query's `useInfiniteQuery` and passes the current
`skip` offset to each installed add-on. Catalog rows can request the next page
without replacing the existing Play Best and source-preparation flows.

#### 3. Reanimated-Based Skeleton Shimmer

The `SkeletonLoader` uses the legacy `Animated` API for its opacity pulse. Moving to `react-native-reanimated` (already in the project at v4.5.3) would allow a horizontal gradient shimmer effect (via `LinearGradient` + a shared value animated position) rather than a simple opacity pulse, which is the standard modern pattern and looks significantly more polished.

#### 4. Stream List Virtualization

The stream list on the detail screen renders inside a `ScrollView` (not a `FlatList`). For popular content, Torrentio can return 50–200+ streams. Rendering all of them at once causes jank on lower-end Android devices. Replace with a `FlashList` (`@shopify/flash-list`, which recycling-list-compatible with variable height) for the stream list.

### Medium Priority

#### 6. Biometric Lock Session

`BiometricLockOverlay` re-authenticates on every app foreground event (`AppState` change to `"active"`). This is aggressive for normal use — users unlock their phone every few minutes. Implement a session timeout: if the app was last active < 5 minutes ago, skip re-authentication. Store `lastForegroundTime` in the `authStore`.

#### 7. Keyboard Navigation for Desktop

Electron/web now has a baseline `useWebPressableActivation` helper for
Tab-focusable Pressables, Enter/Space activation, and input-modality-aware
focus. Pointer focus stays quiet, while `:focus-visible` receives an explicit
ring. Controls retain the strong three-pixel treatment; artwork cards use a
tighter two-pixel, offset media ring so hover lift and keyboard focus are never
confused. On Home and Detail that ring, selected media state, and progress use
the active cinematic palette; neutral utility routes keep semantic theme focus.
Generated Expo Router anchors are styled on the actual outer focus node rather
than only the inner Pressable.
It is applied to catalog cards, Continue Watching cards, library cards,
episode row actions, stream source rows, and desktop topbar/search actions.
Future passes should extend this to remaining settings/detail controls and
validate full keyboard-only browse -> detail -> Play flows in Electron.

#### 8. Player Seek Bar Accessibility (Implemented)

`PlayerControls` exposes its custom timeline as an adjustable accessibility
control with a progress value and increment/decrement actions. The same guarded
seek callbacks back pointer, accessibility, and desktop hotkey input. Streams
that cannot seek expose a disabled state and explanatory copy rather than a
misleading interactive timeline. The progressive-to-seekable handoff follows
the same rule: the disabled state remains until the replacement media source is
ready, not merely until background preparation has reported completion.

#### 9. Offline-First Library

The `useLibrary` and `useContinueWatching` hooks have no offline persistence — if the device is offline, the lists are empty. Since this data changes infrequently, it's a strong candidate for React Query's `persistQueryClient` plugin with `AsyncStorage` as the persister. This would show stale cached library data when offline rather than an empty state.

#### 10. `CommandPalette` on All Platforms

The `CommandPalette` is desktop-only (`Platform.OS === "web"`). On mobile, there is no global search shortcut — the search screen is a separate tab. A long-press on the search tab icon or a pull-down gesture on the home screen could reveal an equivalent search overlay on native platforms.

### Lower Priority

#### 11. Split `player.tsx` Further

The player now delegates media normalization, runtime view state, timeline
semantics, subtitle loading/parsing/ranking, fallback continuity, next-episode
selection/preplanning, diagnostics and supplied segments to focused modules.
`app/player.tsx` is still a large composition and lifecycle host. A later
scoped pass can extract cast ownership, seekable-cache polling, add-on subtitle
catalog coordination and recovery callbacks without replacing the proven
`PlaybackSession` control plane or creating another store.

#### 12. Expand `FlashList` Coverage and Profile Poster Memory

Core poster surfaces now use `expo-image` with memory/disk caching. The next
step is to profile long catalog, search, and episode collections on lower-end
native devices and extend `@shopify/flash-list` only where measurements show
that view recycling improves frame time or memory pressure.

#### 13. i18n Completeness (Implemented for the Overhaul)

User-facing copy touched by the adaptive/Living Cinema work and its core recovery flows is
extracted in English, Dutch, and Spanish. A locale-parity test prevents missing
or extra keys between those files. Future provider/runtime copy must be mapped
to translation keys before it reaches a consumer surface; raw diagnostic data
may remain untranslated inside Advanced diagnostics.

---

## 12. Platform-Specific Intricacies

### Development stream-server stdin

`npm run dev:stream-server` launches the watch process through
`scripts/dev-runtime.cjs`. The stream server is signal-controlled and does not
consume terminal input, so this one child process receives ignored stdin while
stdout and stderr remain attached. SIGINT and SIGTERM are still forwarded and
listeners are removed on exit or spawn failure. This prevents a stale or
disconnected terminal from surfacing an unhandled Node `read EIO` error without
changing normal interactive npm/mobile commands.

### `Platform.OS === "web"` Guards

Many features branch on `Platform.OS === "web"`. File downloads, the `CommandPalette`, `desktopBridge` detection, keyboard event listeners, and hover states all use this guard. On native, web-specific code is dead code but is not tree-shaken unless using platform-specific file extensions (e.g. `.web.ts`). The more complex branching cases should be moved to platform-specific files.

### `onPointerEnter` / `onPointerLeave` on Native

`CinematicTopBar` and `MediaCard` use `onPointerEnter` and `onPointerLeave` for
hover effects. React Native 0.86.2 also supports these on iOS/iPadOS with a
pointer device. Touch presentation must not depend on hover: quick actions
remain reachable through the explicit More/adaptive-overlay path.

### Reactive Window Classes

`DesktopLayout` and the rebuilt Settings/Search surfaces use the shared
`useWindowClass()` contract, which is backed by reactive window dimensions.
Do not reintroduce module-level `Dimensions.get("window")` checks for responsive
navigation or page composition; browser resize and device rotation must update
the active compact, medium, expanded, or large layout.

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

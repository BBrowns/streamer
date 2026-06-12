# Desktop Updates

Streamer uses a conservative desktop update strategy for the first release
path: manual update notices only.

## Current Strategy

- Desktop builds expose the current version through build metadata.
- The Electron main process can check for updates when the user asks.
- Update checks never auto-download or auto-install.
- If an update is available, the app opens the GitHub Releases page in the
  system browser.

Silent background updates are intentionally deferred until signing,
notarization, release publishing, and rollback behavior are proven.

## Runtime Behavior

The desktop shell sets:

```js
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
```

Renderer code can call:

- `window.desktopBridge.getUpdateStatus()`
- `window.desktopBridge.checkForUpdates()`
- `window.desktopBridge.openUpdatePage()`
- `window.desktopBridge.onUpdateStatus(callback)`

In unpackaged development builds, update checks return `unsupported` so local
development does not pretend to validate production update behavior.

## Configuration

The default release page is:

```text
https://github.com/BBrowns/streamer/releases
```

Override it with:

```bash
STREAMER_RELEASES_URL=https://github.com/BBrowns/streamer/releases
```

Only HTTPS release URLs should be used. The main process still routes external
opens through the existing Electron external URL allowlist.

## Deferred Work

Before enabling silent or automatic updates:

- signed and notarized release artifacts must be stable
- GitHub Releases publishing must be automated
- rollback and failed-install behavior must be documented
- update prompts must be tested on real packaged macOS builds
- CI must verify update metadata generation

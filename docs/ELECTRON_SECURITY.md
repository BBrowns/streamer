# Electron Security Model

The desktop shell treats the web renderer as less trusted than the Electron main
process. Renderer code can request privileged actions through the preload API,
but the main process owns downloads, local file access, bridge control, and
external navigation.

## Renderer Boundary

The main window must keep these defaults:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- `allowRunningInsecureContent: false`
- `webviewTag: false`

The renderer URL allowlist is intentionally narrow:

- Development: `http://localhost:8081`, `http://127.0.0.1:8081`, or
  `http://[::1]:8081`.
- Packaged/local: file URLs only inside configured renderer asset roots.

Do not add arbitrary remote renderer origins without a threat model and a
dedicated permission/IPC review.

## IPC Policy

All incoming IPC from the renderer must go through trusted wrappers in
`apps/desktop/src/main.js`. The wrappers validate the sender URL against the
renderer allowlist before running privileged code.

Do not call `ipcMain.handle("channel", ...)` or `ipcMain.on("channel", ...)`
directly for app channels. Add the channel to the allowlist in
`apps/desktop/src/security.js` and register it through `handleTrusted` or
`onTrusted`.

Preload must expose narrow methods only. It must not expose raw `ipcRenderer`,
`ipcRenderer.send`, `ipcRenderer.on`, or Electron event objects to renderer
callbacks.

## Navigation And External Links

Renderer navigation is limited to the renderer allowlist. New windows are denied
by default. External URLs are opened through `shell.openExternal` only after
passing the external URL allowlist; currently this allows `https://` URLs only.

WebViews are blocked. If WebViews are ever needed, add an explicit design and
test plan before enabling them.

## Local Files

Offline media uses the `streamer://` protocol and
`resolveManagedDownloadPath`. Only verified files inside the managed offline
media directory can be resolved. Internal metadata files and partial downloads
are rejected.

## Regression Checks

The desktop package has static and pure unit tests for this policy:

- `apps/desktop/src/electron-hardening.test.js`
- `apps/desktop/src/security.test.js`

CI runs `npm run test --workspace=@streamer/desktop`, and the release gate
requires the desktop security tests to exist.

[日本語](WIDEVINE.md) | [English](WIDEVINE.en.md)

# Widevine / castLabs Electron Setup (Required Reading)

pplayer plays BGM through the Spotify **Web Playback SDK**. Because the Web Playback SDK
requires **EME / Widevine DRM**, stock Electron cannot output audio. The following two items are required.

## 1. castLabs Electron

The `electron` dependency in `package.json` has been replaced with the castLabs build:

```
"electron": "github:castlabs/electron-releases#v39.8.10+wvcus"
```

> **Installation note (GitHub access)**: This dependency is downloaded from GitHub. npm normalization
> changes `resolved` in `package-lock.json` to `git+ssh://git@github.com/...`. If `npm ci` fails on a
> machine or CI environment without an SSH key, configure Git to use https first:
> ```
> git config --global url."https://github.com/".insteadOf "git@github.com:"
> ```
> (No change is needed in an environment with working GitHub access, such as a developer's Mac.)

- Matches upstream Electron 39.8.10 (`+wvcus` indicates a Widevine/VMP-enabled build).
- The Widevine CDM is downloaded to userData at runtime by `components.whenReady()` and is not bundled in the dist.
- The main process must **wait for `components.whenReady()` before creating windows**.
  ```js
  const { app, components } = require('electron')
  await app.whenReady()
  await components.whenReady()   // Widevine CDM 準備
  createWindows()
  ```

## 2. VMP Signing (**Required**, castlabs-evs)

**Playback does not work without signing.** The Widevine signature of an unsigned build is "valid for development only."
Although Spotify licenses are issued, each track produces a `playback_error` after a few seconds and continuously skips to the next track
(verified on a physical device in Phase 0). VMP signing enables continuous playback.

### EVS Account (castLabs, Free, One-Time Setup)

```
pip install --user castlabs-evs          # ツール導入
python3 -m castlabs_evs.account -n signup -A <name> -P <pass> -E <email> -F <first> -L <last> -O <org>
python3 -m castlabs_evs.account -n confirm-signup -A <name> -P <pass> -C <メールで届くコード>
```

Each user must create an EVS account using their own `<name>`, `<email>`, and other details. Do not store passwords or account information in the repository.

### Sign the Development Electron.app (for Audio During Development)

`npm install` and each Electron re-download replace the development binary, so **sign it again every time**.

```
python3 -m castlabs_evs.vmp -n sign-pkg node_modules/electron/dist
```

- Pass the **parent directory `node_modules/electron/dist`, not the `.app` itself**. The tool automatically detects the `*.app` inside it.
- On success, it reports "Signature request successful: streaming, N days left."
- Verify with: `python3 -m castlabs_evs.vmp -n verify-pkg node_modules/electron/dist`

### Sign the Production Package (Phase 3, Implemented)

`electron-builder.yml` already contains the following settings:
- `electronDist: node_modules/electron/dist` — castLabs Electron is not available from the standard mirror, so the local, VMP-signed dist is used without downloading it again.
- `afterSign: build/afterSign.js` — after packaging, runs `python3 -m castlabs_evs.vmp -n sign-pkg <appOutDir>`
  to apply the VMP signature (`build/afterSign.js`). A valid EVS authentication cache is required. If it has expired,
  run `python3 -m castlabs_evs.account -n refresh`; if that still fails, log in again.

Build with `npm run build:mac` and the environment variables below. `CSC_IDENTITY_AUTO_DISCOVERY=false` uses ad-hoc signing without notarization.
The outputs are `dist/pplayer-1.0.0.dmg` / `dist/pplayer-1.0.0-arm64-mac.zip` / `dist/mac-arm64/pplayer.app`.

```
export NPM_CONFIG_CACHE=/private/tmp/pplayer-npm-cache
export ELECTRON_BUILDER_CACHE=/private/tmp/pplayer-eb-cache
export ELECTRON_CACHE=/private/tmp/pplayer-electron-cache
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build:mac
```

Because the app is distributed with ad-hoc signing, right-click it and select Open on first launch. Verification is complete:
`python3 -m castlabs_evs.vmp -n verify-pkg dist/mac-arm64` reports a valid streaming signature, and
**the packaged app (loaded from `file://`) has been verified on a physical device to reach the Web Playback SDK ready state and play continuously**.

## References

- The Phase 0 verification spike (PKCE OAuth + actual playback) is in `spike/` (gitignored, for local reference only).
  It is the reference for the Phase 1 SpotifyController implementation.
- Redirect URI: `http://127.0.0.1:8723/callback` (registered in the Spotify Dashboard).

## BGM State Management Design Notes

The main process remains the SoT for video playback, but because of Web Playback SDK constraints,
**the actual Spotify BGM player is a singleton (`spotifyPlayer.ts`) in the control renderer**. The main process holds only
`activeCueId` (the cue-linking trigger) and the token, and cannot fully reproduce the BGM playback state itself.
This does not violate the existing prohibition on per-frame IPC because no per-frame IPC is used.
BGM output devices also cannot be selected in the app because the SDK plays through a cross-origin iframe and does not support `setSinkId`;
use OS-level routing such as Loopback instead.

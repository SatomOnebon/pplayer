[日本語](README.md) | [English](README.en.md)

# pplayer

A **video cue playback app** for live events on macOS.
Prepare photos and videos as materials, then press GO to **instantly project them onto a circular screen**.
Also supports **BGM playback** from your own **local audio files** or through **Spotify** integration.

## Key Features

- **Cue playback**: Prepare photos, videos, and still images as materials and add them to cues. **Press GO for instant projection**. Includes a standby image, blackout, FTB, and instant jumps to any cue.
- **Circular mask projection**: Uses a control window on the MacBook and a display window on the projector. Supports circular and custom image masks with position and size adjustment.
- **Live operation support**:
  - **Output lock**: While locked, operations that change the live output (GO, next/previous, cue triggering, blackout, etc.) are disabled through every control path. Materials can still be prepared.
  - **Material reload**: After replacing a file with one of the same name, apply the change without restarting by clicking "↻ Reload."
  - **Material preview**: Preview materials without sending them to the live output (muted). Videos can be checked with sound in an external player.
  - **Stream Deck integration**: Control GO, cue triggering, and more externally through global shortcuts and a local HTTP API.
- **MP4 export**: Export slideshows as H.264 video.
- **BGM playback**: Play music in the app with an independent transport and **cue linking** (automatic switching and fades on GO). Switch between two sources:
  - **Local audio** (suitable for commercial use): Build and play playlists from your own audio files. Supports **output device selection** (`setSinkId`) and both **crossfade** and **fade-out → fade-in** modes.
  - **Spotify** (bonus feature): Integrates Spotify playback in the app through the Web Playback SDK. Requires Premium and your own Client ID (see below).

## Requirements

- macOS (verified on Apple Silicon).
- **Local-audio BGM**: No additional registration is required; just load your own audio files.
- **Spotify BGM**: A Spotify **Premium** account and the **Client ID** of a Spotify app you register yourself (see below).
- Building requires **castLabs Electron and VMP signing** (see `WIDEVINE.en.md`).

## Setup

### 1. Prepare Spotify (only if using Spotify BGM)

> This product uses the Spotify API/SDK but is **not endorsed, certified, or otherwise
> approved by Spotify**. Spotify is a trademark of Spotify AB.

1. Create your own app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add `http://127.0.0.1:8723/callback` as a **Redirect URI**.
3. Select **Web API** and **Web Playback SDK** under "Which API/SDKs."
4. Enter the issued **Client ID** in the app's "BGM (Spotify)" panel, then click "Connect to Spotify."
   - No Client Secret is needed (PKCE is used). The repository does not include a Client ID.

### 2. Development

```bash
npm install
npm run dev
```

### 3. Build (macOS)

**If you delegate the build to an AI agent such as Claude Code or Cursor, give it [`BUILD.en.md`](./BUILD.en.md).**
It contains executable steps in order and clearly identifies where human action is required.

- If you **do not use Spotify BGM** (local-audio BGM and video only), Widevine is unnecessary, and the build can be **fully automated without signing**:

  ```bash
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  export PPLAYER_SKIP_VMP=1
  npm run build:mac        # → dist/pplayer-1.0.0.dmg 等
  ```

  (In this build, the Spotify tab in the BGM panel is hidden and only local-audio BGM is available. Video, Stream Deck integration, and all other features still work.)

- To **use Spotify BGM**, enabling Widevine requires **castLabs Electron** and **VMP signing**
  (a free castLabs EVS account is required). See [`WIDEVINE.en.md`](./WIDEVINE.en.md) / [`BUILD.en.md`](./BUILD.en.md) for details:

  ```bash
  python3 -m castlabs_evs.account -n refresh   # EVS 認証（初回は WIDEVINE.md のサインアップ）
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  npm run build:mac        # afterSign で VMP 署名を自動適用
  ```

Because the app is distributed with ad-hoc signing, you may need to right-click it and select Open on first launch.

## Important Usage and Liability Notice

- **Music rights clearance**: Public playback of music at events may require rights clearance (through **JASRAC / NexTone**, etc. in Japan).
  - **Spotify**: Its consumer Terms generally permit **personal, non-commercial use** only, so **public playback may violate those Terms**.
  - **Local audio**: Spotify's Terms do not apply, but **public performance rights must still be secured** when using music created by others. Your own music or properly licensed audio may be used at commercial events.
  - Compliance with all such requirements is **the user's responsibility**.
- See [`NOTICE.en.md`](./NOTICE.en.md) for third-party components, trademarks, and bundled licenses.

## License

[MIT](./LICENSE). Bundled third-party components such as FFmpeg are subject to their respective licenses (see `NOTICE.en.md`).

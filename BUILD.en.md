[日本語](BUILD.md) | [English](BUILD.en.md)

# BUILD.md — Automated Build Instructions for AI Agents

This executable guide is for anyone who clones the repository and wants to **delegate the build to an AI coding agent**
such as Claude Code, Cursor, or Codex.
In general, the agent may run the commands from top to bottom.
Steps that require human action are clearly marked **[HUMAN REQUIRED]**; ask the user to perform or confirm them.

- Usage, disclaimers, and licenses → [`README.en.md`](./README.en.md) / [`NOTICE.en.md`](./NOTICE.en.md)
- Widevine / signing details → [`WIDEVINE.en.md`](./WIDEVINE.en.md)
- Development rules (invariants) → [`AGENTS.en.md`](./AGENTS.en.md)

---

## 0. Prerequisites

| Item | Requirement |
| ------------ | ------------------------------------------------------------------------- |
| OS | **macOS (verified on Apple Silicon)**. Intel Mac / Windows / Linux are untested. |
| Node.js | **20 or later** (development verified with Node 22.18 / npm 10.9) |
| Python 3 | Required **only when using Spotify BGM** (used for VMP signing) |
| Network | Required (downloads castLabs Electron from GitHub) |

Check:

```bash
node -v && npm -v && sw_vers -productVersion && uname -m
```

---

## 1. Choose a Build Path First (Important)

Build complexity depends on **whether Spotify will provide the BGM**.

- **A. Local-audio BGM + video only** → Widevine is unnecessary.
  **No EVS account or VMP signing is required, and the AI can complete the entire build automatically** (→ [Path A](#path-a--no-widevine-fully-automated)).
  This is the option suitable for commercial events, using playlists of your own audio files.
- **B. Include Spotify BGM** → Widevine (EME/DRM) is required.
  A free castLabs **EVS account** and **VMP signing** are required.
  **Only EVS sign-up requires human action because it includes email verification** (→ [Path B](#path-b--with-widevine-spotify-bgm)).

> [FOR THE AGENT] If the user has not specified which option they want, **ask first**.
> When in doubt, suggest **Path A**, which can be completed automatically.

---

## 2. Common Setup (Run for Both A and B)

```bash
# （任意）SSH 鍵未設定の環境で castLabs Electron の取得に失敗する場合のみ:
#   git+ssh を https に読み替える
git config --global url."https://github.com/".insteadOf "git@github.com:"

npm install
npm run typecheck
npm test          # 67 件すべてパスすること（fail 0）
```

If `npm install` fails while fetching `github:castlabs/electron-releases#...`, apply the
`insteadOf` setting above and run it again.

---

## Path A — No Widevine (Fully Automated)

Use this path when Spotify is not needed. Neither EVS nor signing is required, so an AI can complete the process automatically.

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false   # ad-hoc 署名（Apple Developer 証明書は不要）
export PPLAYER_SKIP_VMP=1                   # VMP 署名（EVS）をスキップ
npm run build:mac
```

**Outputs** (`dist/`):

- `pplayer-<version>.dmg` — distribution installer
- `pplayer-<version>-arm64-mac.zip`
- `mac-arm64/pplayer.app` — application bundle

**Limitation of this app build**: In a `PPLAYER_SKIP_VMP=1` build, the Spotify tab in the BGM panel is hidden
and only local-audio BGM is available, avoiding confusion because unsigned Widevine cannot play Spotify.
**Local-audio BGM, video cue playback, Stream Deck integration, MP4 export, and all other features work**.

→ Continue to [Verification](#3-verification).

---

## Path B — With Widevine (Spotify BGM)

Continuous Spotify BGM playback requires VMP signing. Without it, each track produces
`playback_error` after a few seconds and continuously skips. See [`WIDEVINE.en.md`](./WIDEVINE.en.md) for details.

### B-1. Create an EVS Account [HUMAN REQUIRED, FIRST TIME ONLY]

Sign up for free castLabs EVS. **A verification code sent by email must be entered**, so
a human must complete this step or provide the agent with the email address, password, and verification code.

```bash
pip install --user castlabs-evs
python3 -m castlabs_evs.account -n signup \
  -A <name> -P <pass> -E <email> -F <first> -L <last> -O <org>
python3 -m castlabs_evs.account -n confirm-signup \
  -A <name> -P <pass> -C <メールで届く確認コード>
```

> **Never commit account details or passwords to the repository.**
> On additional machines, sign-up is unnecessary if you already have an account.

### B-2. Refresh the Authentication Token

```bash
python3 -m castlabs_evs.account -n refresh
```

If this fails, log in again (see `WIDEVINE.en.md`).

### B-3. Build (afterSign Applies VMP Signing Automatically)

Do **not** set `PPLAYER_SKIP_VMP`. The `afterSign` hook in `electron-builder.yml`
automatically applies VMP signing after packaging.

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build:mac
```

### B-4. Verify the Signature

```bash
python3 -m castlabs_evs.vmp -n verify-pkg dist/mac-arm64
# → "Signature is valid: streaming, N days left" なら成功
# （"valid for development only" と出たら未署名。B-2 からやり直す）
```

### B-5. Spotify Client ID [HUMAN REQUIRED]

The repository does not contain a Client ID. **Each user must register their own Spotify app** and obtain one,
then enter it in the "BGM (Spotify)" panel after launching the app. See [`README.en.md`](./README.en.md) for the Dashboard settings
(Redirect URI `http://127.0.0.1:8723/callback`, enabling Web API / Web Playback SDK, and a Premium account).

→ Continue to [Verification](#3-verification).

---

## 3. Verification

```bash
open dist/mac-arm64/pplayer.app
```

- **First launch**: Because the app uses ad-hoc signing and is not notarized, if Gatekeeper blocks it,
  **right-click it in Finder and select "Open"** (or allow it under System Settings → Privacy & Security).
- **Video cue playback**: Add a material → add it to a cue → press GO and confirm it appears in the display window.
- **Local-audio BGM**: Set the source to "Local" in the BGM panel, create a playlist from audio files, and play it.
  Confirm that output device selection and crossfade work.
- **Spotify BGM (Path B only)**: Enter the Client ID → connect → play a playlist and confirm that it **plays continuously without skipping after a few seconds**.

castLabs Electron **automatically downloads** the Widevine CDM on first launch. It is normal for the CDM not to be bundled in `dist`.

---

## 4. Troubleshooting

| Symptom | Solution |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm install` fails on `git+ssh://git@github.com/...` | Apply the `insteadOf` setting under [Common Setup](#2-common-setup-run-for-both-a-and-b), then run it again. |
| EVS authentication error / signing failure in `afterSign` | Run `python3 -m castlabs_evs.account -n refresh`. If that does not help, log in again. If Spotify is unnecessary, switch to **Path A (`PPLAYER_SKIP_VMP=1`)**. |
| Spotify skips each track after a few seconds | The package lacks VMP signing. Sign it again with Path B (B-2 through B-4) and confirm that `verify-pkg` reports streaming valid. |
| "Developer cannot be verified" at launch | This is due to ad-hoc signing. Right-click the app and select "Open." |
| `python3` or `castlabs_evs` is unavailable | Build with Path A (skip signing), or run `pip install --user castlabs-evs`. |
| Intel Mac / Windows / Linux | Untested. electron-builder targets must be changed (`build:win` / `build:linux` are placeholders only and have not been verified). |

---

## 5. Key Points for Agents (TL;DR)

1. Confirm `node -v` (20+) and macOS/arm64.
2. Run `npm install && npm run typecheck && npm test` (fail 0).
3. No Spotify → `CSC_IDENTITY_AUTO_DISCOVERY=false PPLAYER_SKIP_VMP=1 npm run build:mac` (**fully automated; stop here**).
4. Spotify required → EVS sign-up [HUMAN REQUIRED] → `account -n refresh` → `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac` → confirm streaming valid with `vmp -n verify-pkg dist/mac-arm64`.
5. Distribute `dist/pplayer-<version>.dmg`. On first launch, right-click and select Open.

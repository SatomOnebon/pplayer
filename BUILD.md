[日本語](BUILD.md) | [English](BUILD.en.md)

# BUILD.md — AI エージェント向け自動ビルド手順

このファイルは、リポジトリを clone した人が **AI コーディングエージェント（Claude Code /
Cursor / Codex など）にビルドを任せる**ための実行可能な手順書です。
エージェントは原則、上から順にコマンドを実行して構いません。
**人間の操作が必要な箇所は【要・人間】と明記**しているので、そこはユーザーに依頼・確認してください。

- 使い方・免責・ライセンス → [`README.md`](./README.md) / [`NOTICE.md`](./NOTICE.md)
- Widevine / 署名の詳細 → [`WIDEVINE.md`](./WIDEVINE.md)
- 開発規約（不変条件）→ [`AGENTS.md`](./AGENTS.md)

---

## 0. 前提環境

| 項目         | 要件                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| OS           | **macOS（Apple Silicon で確認）**。Intel Mac / Windows / Linux は未検証。 |
| Node.js      | **20 以上**（開発は Node 22.18 / npm 10.9 で確認）                        |
| Python 3     | **Spotify BGM を使う場合のみ**必要（VMP 署名に使用）                      |
| ネットワーク | 必要（castLabs 版 Electron を GitHub から取得）                           |

確認:

```bash
node -v && npm -v && sw_vers -productVersion && uname -m
```

---

## 1. 最初に分岐を決める（重要）

**BGM を Spotify で流すかどうか**でビルドの難易度が変わります。

- **A. ローカル音源BGM ＋ 映像だけでよい** → Widevine 不要。
  **EVS アカウントも VMP 署名も不要で、AI が完全自動でビルドできます**（→ [Path A](#path-a--widevine-なし完全自動)）。
  商用イベントで使えるのはこちら（自前音源のプレイリスト再生）。
- **B. Spotify BGM も使いたい** → Widevine（EME/DRM）が必須。
  castLabs の無料 **EVS アカウント**と **VMP 署名**が要ります。
  **EVS のサインアップだけはメール確認が要るため人間の操作が必要**（→ [Path B](#path-b--widevine-ありspotify-bgm)）。

> 【エージェントへ】どちらにするかユーザーに明示されていなければ、**先に確認**してください。
> 迷う場合は、まず自動で完結する **Path A** を提案するのが無難です。

---

## 2. 共通セットアップ（A/B とも実行）

```bash
# （任意）SSH 鍵未設定の環境で castLabs Electron の取得に失敗する場合のみ:
#   git+ssh を https に読み替える
git config --global url."https://github.com/".insteadOf "git@github.com:"

npm install
npm run typecheck
npm test          # 67 件すべてパスすること（fail 0）
```

`npm install` が `github:castlabs/electron-releases#...` の取得で失敗する場合は、上の
`insteadOf` 設定を入れてから再実行してください。

---

## Path A — Widevine なし（完全自動）

Spotify を使わない場合。EVS も署名も不要で、AI が最後まで自動実行できます。

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false   # ad-hoc 署名（Apple Developer 証明書は不要）
export PPLAYER_SKIP_VMP=1                   # VMP 署名（EVS）をスキップ
npm run build:mac
```

**成果物**（`dist/`）:

- `pplayer-<version>.dmg` — 配布用インストーラ
- `pplayer-<version>-arm64-mac.zip`
- `mac-arm64/pplayer.app` — アプリ本体

**この app の制約**: `PPLAYER_SKIP_VMP=1` ビルドでは **BGM パネルの Spotify タブは非表示**になり、
ローカル音源BGM のみになります（未署名 Widevine では Spotify を再生できないため、混乱を避けて隠す）。
**ローカル音源BGM・映像ポン出し・Stream Deck 連携・MP4 書き出し等はすべて動作**します。

→ [動作確認](#3-動作確認) へ。

---

## Path B — Widevine あり（Spotify BGM）

Spotify BGM を連続再生するには VMP 署名が必須です（未署名だと各曲が数秒で
`playback_error` → スキップし続けます）。詳細は [`WIDEVINE.md`](./WIDEVINE.md)。

### B-1. EVS アカウント作成 【要・人間（初回のみ）】

castLabs EVS（無料）にサインアップします。**メールに届く確認コードの入力が必要**なので、
ここは人間が行うか、ユーザーに情報（メール・パスワード・確認コード）を提供してもらってください。

```bash
pip install --user castlabs-evs
python3 -m castlabs_evs.account -n signup \
  -A <name> -P <pass> -E <email> -F <first> -L <last> -O <org>
python3 -m castlabs_evs.account -n confirm-signup \
  -A <name> -P <pass> -C <メールで届く確認コード>
```

> アカウント情報・パスワードは**リポジトリに絶対にコミットしない**でください。
> 2 台目以降のマシンでは、既にアカウントがあれば `signup` は不要です。

### B-2. 認証トークンを更新

```bash
python3 -m castlabs_evs.account -n refresh
```

失敗する場合は再ログイン（`WIDEVINE.md` 参照）。

### B-3. ビルド（afterSign が自動で VMP 署名）

`PPLAYER_SKIP_VMP` は**付けない**こと。`electron-builder.yml` の `afterSign` フックが
パッケージ後に自動で VMP 署名します。

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build:mac
```

### B-4. 署名を検証

```bash
python3 -m castlabs_evs.vmp -n verify-pkg dist/mac-arm64
# → "Signature is valid: streaming, N days left" なら成功
# （"valid for development only" と出たら未署名。B-2 からやり直す）
```

### B-5. Spotify Client ID 【要・人間】

Client ID はリポジトリに含まれていません。**各自の Spotify アプリを登録**して取得し、
起動後のアプリ内「BGM（Spotify）」パネルに入力します。Dashboard 側の設定
（Redirect URI `http://127.0.0.1:8723/callback`、Web API / Web Playback SDK の有効化、
Premium アカウント）は [`README.md`](./README.md) を参照。

→ [動作確認](#3-動作確認) へ。

---

## 3. 動作確認

```bash
open dist/mac-arm64/pplayer.app
```

- **初回起動**: ad-hoc 署名・未公証のため、Gatekeeper に弾かれたら
  **Finder で右クリック →「開く」**（または「システム設定 → プライバシーとセキュリティ」で許可）。
- **映像ポン出し**: 素材を追加 → キューへ → GO で表示ウィンドウに投影。
- **ローカル音源BGM**: BGM パネルでソースを「ローカル」にし、音声ファイルからプレイリスト作成 → 再生。
  出力デバイス選択・クロスフェードが効くこと。
- **（Path B のみ）Spotify BGM**: Client ID を入力 → 連携 → プレイリスト再生が**数秒でスキップせず連続再生**すること。

Widevine CDM は castLabs Electron が**初回起動時に自動ダウンロード**します（`dist` に同梱されないのは正常）。

---

## 4. トラブルシュート

| 症状                                                   | 対処                                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm install` が `git+ssh://git@github.com/...` で失敗 | [共通セットアップ](#2-共通セットアップab-とも実行)の `insteadOf` 設定を入れて再実行                                              |
| `afterSign` で EVS 認証エラー / 署名失敗               | `python3 -m castlabs_evs.account -n refresh`。直らなければ再ログイン。Spotify 不要なら **Path A（`PPLAYER_SKIP_VMP=1`）** に切替 |
| Spotify で各曲が数秒で飛ぶ                             | VMP 未署名。Path B（B-2〜B-4）で署名し直す（`verify-pkg` が streaming valid になること）                                         |
| 起動時「開発元を確認できません」                       | ad-hoc 署名のため。右クリック →「開く」で許可                                                                                    |
| `python3` が無い / `castlabs_evs` が無い               | Path A（署名スキップ）でビルドするか、`pip install --user castlabs-evs`                                                          |
| Intel Mac / Windows / Linux                            | 未検証。electron-builder の対象を変える必要あり（`build:win` / `build:linux` は雛形のみ・未確認）                                |

---

## 5. エージェント向けの要点（TL;DR）

1. `node -v`（20+）と macOS/arm64 を確認。
2. `npm install && npm run typecheck && npm test`（fail 0）。
3. Spotify 不要 → `CSC_IDENTITY_AUTO_DISCOVERY=false PPLAYER_SKIP_VMP=1 npm run build:mac`（**完全自動・ここで完結**）。
4. Spotify 必要 → EVS サインアップ【要・人間】→ `account -n refresh` → `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac` → `vmp -n verify-pkg dist/mac-arm64` で streaming valid を確認。
5. `dist/pplayer-<version>.dmg` を配布。初回起動は右クリック→開く。

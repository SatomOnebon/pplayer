[日本語](WIDEVINE.md) | [English](WIDEVINE.en.md)

# Widevine / castLabs Electron セットアップ（必読）

pplayer は Spotify **Web Playback SDK** で BGM を再生する。Web Playback SDK は
**EME / Widevine DRM** を要求するため、素の Electron では音が出ない。以下の 2 点が必須。

## 1. castLabs 版 Electron

`package.json` の `electron` を castLabs ビルドに差し替えてある:

```
"electron": "github:castlabs/electron-releases#v39.8.10+wvcus"
```

> **install 時の注意（GitHub アクセス）**: この依存は GitHub から取得する。`package-lock.json` の
> `resolved` は npm の正規化で `git+ssh://git@github.com/...` になる。SSH 鍵を設定していない
> マシン/CI で `npm ci` が失敗する場合は、事前に以下で https 経由に読み替える:
> ```
> git config --global url."https://github.com/".insteadOf "git@github.com:"
> ```
> （開発者の Mac のように GitHub アクセスが通る環境ではそのままで可。）

- 本家 Electron 39.8.10 とバージョン一致（`+wvcus` = Widevine/VMP 対応ビルド）。
- Widevine CDM はランタイムで `components.whenReady()` が userData にダウンロードする（dist には同梱されない）。
- main 側は **`components.whenReady()` を待ってからウィンドウを生成**すること。
  ```js
  const { app, components } = require('electron')
  await app.whenReady()
  await components.whenReady()   // Widevine CDM 準備
  createWindows()
  ```

## 2. VMP 署名（**必須**・castlabs-evs）

**未署名だと再生が成立しない。** 未署名ビルドの Widevine 署名は "valid for development only" で、
Spotify のライセンスは通るものの各曲が数秒で `playback_error` → 次曲へスキップし続ける
（Phase 0 で実機確認済み）。VMP 署名すると連続再生できる。

### EVS アカウント（castLabs、無料。一度だけ）

```
pip install --user castlabs-evs          # ツール導入
python3 -m castlabs_evs.account -n signup -A <name> -P <pass> -E <email> -F <first> -L <last> -O <org>
python3 -m castlabs_evs.account -n confirm-signup -A <name> -P <pass> -C <メールで届くコード>
```

EVS アカウントは各自で作成する（`<name>`/`<email>` 等は自分のもの）。パスワードやアカウント情報はリポジトリに置かない。

### dev の Electron.app を署名（開発中に音を出すため）

`npm install` や electron 再取得のたびに dev バイナリが差し替わるので、**その都度署名し直す**。

```
python3 -m castlabs_evs.vmp -n sign-pkg node_modules/electron/dist
```

- 渡すのは **`.app` ではなく親ディレクトリ `node_modules/electron/dist`**（中の `*.app` を自動検出する仕様）。
- 成功すると "Signature request successful: streaming, N days left"。
- 確認: `python3 -m castlabs_evs.vmp -n verify-pkg node_modules/electron/dist`

### 本番パッケージの署名（Phase 3・実装済み）

`electron-builder.yml` に以下を設定済み:
- `electronDist: node_modules/electron/dist` — castLabs Electron は標準ミラーに無いため、
  再ダウンロードさせずローカルの dist（VMP 署名済み）を使う。
- `afterSign: build/afterSign.js` — パッケージ後に `python3 -m castlabs_evs.vmp -n sign-pkg <appOutDir>`
  を実行して VMP 署名を適用（`build/afterSign.js`）。EVS の認証キャッシュが必要（切れていたら
  `python3 -m castlabs_evs.account -n refresh`、それでも駄目なら再ログイン）。

ビルド: `npm run build:mac`（環境変数は下記）。`CSC_IDENTITY_AUTO_DISCOVERY=false`（ad-hoc・未公証）。
生成物は `dist/pplayer-1.0.0.dmg` / `dist/pplayer-1.0.0-arm64-mac.zip` / `dist/mac-arm64/pplayer.app`。

```
export NPM_CONFIG_CACHE=/private/tmp/pplayer-npm-cache
export ELECTRON_BUILDER_CACHE=/private/tmp/pplayer-eb-cache
export ELECTRON_CACHE=/private/tmp/pplayer-electron-cache
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build:mac
```

未署名（ad-hoc）配布のため初回は右クリック→開く。検証済み:
`python3 -m castlabs_evs.vmp -n verify-pkg dist/mac-arm64` が streaming 署名 valid、
**パッケージ済みアプリ（`file://` 読み込み）で Web Playback SDK が ready 到達・連続再生できることを実機確認済み**。

## 参考

- Phase 0 の検証用スパイク（PKCE OAuth + 実再生）は `spike/`（gitignore・ローカル参照専用）。
  Phase 1 の SpotifyController 実装のリファレンス。
- Redirect URI: `http://127.0.0.1:8723/callback`（Spotify Dashboard に登録済み）。

## 設計上の注意（BGM の状態管理）

映像再生の SoT はメインプロセスのままだが、**Spotify BGM は Web Playback SDK の制約で
control renderer のシングルトン（`spotifyPlayer.ts`）が実体**。main が持つのは
`activeCueId`（キュー連動のトリガ）とトークンのみで、BGM の再生状態そのものは main では
完全再現できない（毎フレーム IPC はしていないので既存の「毎フレーム IPC 禁止」には抵触しない）。
BGM 出力デバイスのアプリ内選択も不可（SDK がクロスオリジン iframe で再生・`setSinkId` 不可、
運用は Loopback 等の OS 側ルーティング）。

# pplayer

円形スクリーンへ写真・動画を投影する、ライブイベント用の演出プレイヤー（macOS）。
素材ライブラリ＋キューリストで本番を進行し、**Spotify と連携して BGM** も流せます。

> This product uses the Spotify API/SDK but is **not endorsed, certified, or otherwise
> approved by Spotify**. Spotify is a trademark of Spotify AB.

## 主な機能

- **円形マスク投影**: 操作ウィンドウ（MacBook）＋表示ウィンドウ（プロジェクター）。円形/カスタム画像マスク、位置・サイズ調整。
- **素材＋キュー構成**: スライドショー／動画／静止画を素材として管理し、キューへ登録。GO で進行、蓋絵（スタンバイ）、ブラックアウト、FTB。
- **MP4 書き出し**: スライドショーを H.264 で書き出し。
- **Spotify BGM**: Web Playback SDK でアプリ内再生。独立トランスポート＋キュー連動（GO で BGM 自動切替・フェード）。
- **本番運用支援**:
  - **出力ロック**: ロック中はライブ出力を変える操作（GO/次前/キュー発火/ブラックアウト等）を全経路で無効化。素材の仕込みは可能。
  - **素材リロード**: 同名ファイルを差し替えたら「↻ リロード」で再起動なしに反映。
  - **素材プレビュー**: 本番に出さず素材を確認（無音）。動画は外部プレーヤーで音つき確認。
  - **Stream Deck 連携**: グローバルショートカット＋ローカル HTTP API（GO・キュー・Spotify 再生/停止/前後）。

## 動作環境

- macOS（Apple Silicon で確認）。
- **Spotify BGM を使う場合**: Spotify **Premium** アカウントと、自分で登録した Spotify アプリの **Client ID**（下記）。
- ビルドには **castLabs 版 Electron ＋ VMP 署名**が必要（`WIDEVINE.md` 参照）。

## セットアップ

### 1. Spotify を使う準備（BGM 機能を使う場合のみ）

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) で自分のアプリを作成。
2. **Redirect URI** に `http://127.0.0.1:8723/callback` を追加。
3. 「Which API/SDKs」で **Web API** と **Web Playback SDK** を選択。
4. 発行された **Client ID** を、アプリの「BGM（Spotify）」パネルに入力 → 「Spotify と連携」。
   - Client Secret は不要（PKCE を使用）。リポジトリに Client ID は含まれていません。

### 2. 開発

```bash
npm install
npm run dev
```

### 3. ビルド（macOS）

Widevine を有効化するため **castLabs 版 Electron** と **VMP 署名**が必要です。手順の詳細は
[`WIDEVINE.md`](./WIDEVINE.md) を参照してください（castLabs EVS の無料アカウントが必要）。

```bash
# 事前に castlabs-evs で dev バイナリを VMP 署名（WIDEVINE.md 参照）
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build:mac   # afterSign で VMP 署名を自動適用 → dist/pplayer-1.0.0.dmg 等
```

未署名（ad-hoc）配布のため、初回起動は右クリック→開くが必要な場合があります。

## 重要な注意（利用上の責任）

- Spotify の消費者向け利用規約は原則「**個人・非商用利用**」です。**イベント等での公衆再生は
  Spotify の規約に反する可能性**があり、加えて楽曲の**公衆演奏には別途の権利処理（日本では
  JASRAC / NexTone 等）**が必要な場合があります。これらの遵守は**利用者の責任**です。
- サードパーティ・商標・同梱ライセンスについては [`NOTICE.md`](./NOTICE.md) を参照。

## ライセンス

[MIT](./LICENSE)。同梱される FFmpeg 等の第三者コンポーネントは各自のライセンスに従います（`NOTICE.md`）。

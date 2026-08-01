# pplayer

ライブイベント用の**映像ポン出し（キュー出し）アプリ**（macOS）。
写真・動画を素材として仕込み、GO で**円形スクリーンへ瞬時に投影**します。
**BGM 再生**にも対応（自前の**ローカル音源**、または **Spotify** 連携）。

## 主な機能

- **ポン出し（キュー出し）**: 写真・動画・静止画を素材として仕込み、キューへ登録。**GO で瞬時に投影**。蓋絵（スタンバイ）、ブラックアウト、FTB、任意キューへの即ジャンプ。
- **円形マスク投影**: 操作ウィンドウ（MacBook）＋表示ウィンドウ（プロジェクター）。円形／カスタム画像マスク、位置・サイズ調整。
- **本番運用支援**:
  - **出力ロック**: ロック中はライブ出力を変える操作（GO／次前／キュー発火／ブラックアウト等）を全経路で無効化。素材の仕込みは可能。
  - **素材リロード**: 同名ファイルを差し替えたら「↻ リロード」で再起動なしに反映。
  - **素材プレビュー**: 本番に出さず素材を確認（無音）。動画は外部プレーヤーで音つき確認。
  - **Stream Deck 連携**: グローバルショートカット＋ローカル HTTP API で GO・キュー発火などを外部コントロール。
- **MP4 書き出し**: スライドショーを H.264 で書き出し。
- **BGM 再生**: 音楽をアプリ内で再生。独立トランスポート＋**キュー連動**（GO で自動切替・フェード）。2 つのソースを切替：
  - **ローカル音源**（商用利用可）: 自前の音声ファイルでプレイリストを作成して再生。**出力デバイス選択**（`setSinkId`）、**クロスフェード／フェードアウト→イン**の両モード切替。
  - **Spotify**（おまけ）: Spotify と連携してアプリ内再生（Web Playback SDK）。要 Premium・自分の Client ID（下記）。

## 動作環境

- macOS（Apple Silicon で確認）。
- **ローカル音源 BGM**: 追加の登録は不要（自前の音声ファイルを読み込むだけ）。
- **Spotify BGM を使う場合**: Spotify **Premium** アカウントと、自分で登録した Spotify アプリの **Client ID**（下記）。
- ビルドには **castLabs 版 Electron ＋ VMP 署名**が必要（`WIDEVINE.md` 参照）。

## セットアップ

### 1. Spotify を使う準備（BGM 機能を使う場合のみ）

> This product uses the Spotify API/SDK but is **not endorsed, certified, or otherwise
> approved by Spotify**. Spotify is a trademark of Spotify AB.

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

- **BGM の権利処理**: イベント等で楽曲を**公衆再生**する場合、楽曲の権利処理（日本では
  **JASRAC / NexTone 等**）が必要な場合があります。
  - **Spotify**: 消費者向け利用規約は原則「**個人・非商用利用**」で、**公衆再生は規約に反する可能性**があります。
  - **ローカル音源**: Spotify の規約は関係しませんが、他者の楽曲を使う場合の**公衆演奏権は別途必要**です
    （自作・ライセンス取得済みの音源であれば商用イベントでも利用できます）。
  - いずれもこれらの遵守は**利用者の責任**です。
- サードパーティ・商標・同梱ライセンスについては [`NOTICE.md`](./NOTICE.md) を参照。

## ライセンス

[MIT](./LICENSE)。同梱される FFmpeg 等の第三者コンポーネントは各自のライセンスに従います（`NOTICE.md`）。

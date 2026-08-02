[日本語](CHANGELOG.md) | [English](CHANGELOG.en.md)

# 変更履歴

本プロジェクトの主な変更を記録します。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に準じます。

## [Unreleased]

## [1.0.0] - 2026-08-02

初回公開リリース。

### 追加
- **ポン出し（キュー出し）**: 写真・動画・スライドショーをキュー化し、GO で円形スクリーンへ瞬時に投影。蓋絵（スタンバイ）、ブラックアウト、FTB、任意キューへのジャンプ、単クリックで次に設定／ダブルクリックで即時発火。
- **円形マスク投影**: 操作ウィンドウ（MacBook）＋表示ウィンドウ（プロジェクター）。円形／カスタム画像マスク、位置・サイズ調整、ステージ比率。
- **BGM 再生**: ローカル音源プレイリスト（商用利用可）と Spotify（Web Playback SDK）を切替。独立トランスポート＋キュー連動（GO で自動切替・フェード）、クロスフェード／フェードアウト→インの両モード。マスター音量が映像・BGM 全体に効くミキサー型、映像と BGM で共通の出力デバイス選択。
- **本番運用支援**: 出力ロック（ライブ出力を変える操作を全経路で無効化）、素材リロード（同名差し替えを再起動なしに反映）、無音の素材プレビュー（動画は外部プレーヤーで確認）、Stream Deck 連携（グローバルショートカット＋ローカル HTTP API）。
- **MP4 書き出し**: スライドショーを H.264 で書き出し。
- **多言語 UI（日本語／英語）**: OS 言語の自動判定＋アプリ内切替（準備 > 表示）。ドキュメントも日英併記。
- **macOS ビルド**: castLabs 版 Electron ＋ VMP 署名（Spotify/Widevine 対応）。Spotify 不要なら `PPLAYER_SKIP_VMP=1` で署名なしビルドも可能。

### 注意
- 配布バイナリは ad-hoc 署名・未公証のため、初回起動は右クリック→開く。
- Spotify BGM は各自の Spotify **Premium** アカウントと **Client ID**（アプリ内入力・非同梱）が必要。
- 楽曲の公衆再生には権利処理が必要な場合があり、遵守は利用者の責任（`NOTICE.md` 参照）。

[Unreleased]: https://github.com/SatomOnebon/pplayer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/SatomOnebon/pplayer/releases/tag/v1.0.0

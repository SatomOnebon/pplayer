# NOTICE / サードパーティおよび商標について

本ソフトウェア（pplayer）は MIT ライセンスで配布されます（`LICENSE` 参照）。
以下の第三者コンポーネント・サービスを利用しており、それぞれの条件が適用されます。

## Spotify

- 本アプリは Spotify の **Web API** および **Web Playback SDK** を利用しますが、
  **Spotify によって承認・認定・提携されたものではありません**
  （"This product uses the Spotify API/SDK but is not endorsed, certified, or otherwise
  approved by Spotify. Spotify is a trademark of Spotify AB."）。
- 利用には各自の **Spotify Premium アカウント**と、各自が **Spotify Developer Dashboard で
  登録した自分のアプリの Client ID** が必要です（本リポジトリに Client ID は含みません）。
- 利用者は **Spotify Developer Terms / Developer Policy / 利用規約**に各自同意する必要があります。
- **重要（利用上の責任）**: Spotify の消費者向け利用規約は原則「**個人・非商用利用**」です。
  イベント等での**公衆再生・公衆演奏**は Spotify の規約に反する可能性があり、加えて
  楽曲の公衆演奏には**別途の権利処理（日本では JASRAC / NexTone 等）**が必要な場合があります。
  これらの遵守は**利用者の責任**です。本ソフトウェアはこれらを保証しません。

## Widevine / castLabs

- Spotify Web Playback SDK は EME/Widevine DRM を必要とするため、ビルドには
  **castLabs 版 Electron（Electron for Content Security）**と **VMP 署名（castlabs-evs）**を用います。
- castLabs のコンポーネントおよび Widevine CDM（Google）はそれぞれの提供元の条件に従います。
  Widevine CDM は実行時に取得され、本リポジトリでは再配布しません。詳細は `WIDEVINE.md` 参照。

## FFmpeg（ffmpeg-static）

- 動画書き出しに `ffmpeg-static` 経由で **FFmpeg** を利用します。同梱される FFmpeg ビルドは
  **LGPL/GPL** など FFmpeg 側のライセンスに従います。配布物に FFmpeg バイナリを含める場合は
  当該ライセンスの条件（ソース提供等）を遵守してください。

## その他

- Electron, React, electron-vite, electron-store, @electron-toolkit 等は各 MIT ライセンス等に従います。
- アプリアイコン・Stream Deck アイコン（`build/`, `assets/streamdeck/`）は本プロジェクトの著作物です。

/// <reference types="vite/client" />

// electron.vite.config.ts の define で注入されるコンパイル時フラグ。
// Spotify BGM が有効なビルドか（PPLAYER_SKIP_VMP=1 のときは false でタブごと非表示）。
declare const __SPOTIFY_ENABLED__: boolean

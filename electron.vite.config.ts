import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    // Spotify BGM は Widevine（VMP 署名）を要する。PPLAYER_SKIP_VMP=1 の署名なしビルドでは
    // Spotify UI を出しても再生できないため、コンパイル時に無効化してタブごと隠す。
    define: {
      __SPOTIFY_ENABLED__: JSON.stringify(process.env.PPLAYER_SKIP_VMP !== '1')
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          control: resolve('src/renderer/control.html'),
          display: resolve('src/renderer/display.html')
        }
      }
    }
  }
})

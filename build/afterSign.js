// electron-builder afterSign フック。
// macOS のコード署名（ad-hoc）後に castLabs VMP 署名を適用する。
// Widevine（Spotify Web Playback SDK）を本番アプリで機能させるために必須。
// 事前に castlabs-evs のセットアップと EVS アカウント認証が済んでいること（WIDEVINE.md 参照）。
//
// Spotify BGM を使わない（ローカル音源BGM＋映像だけの）ビルドでは Widevine 不要のため、
// PPLAYER_SKIP_VMP=1 を渡すと VMP 署名（＝EVS アカウント）を省略できる。
// その場合 Spotify BGM は数秒でスキップするが、ローカルBGM・映像・Stream Deck 等は動作する。
const { execFileSync } = require('child_process')

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  if (process.env.PPLAYER_SKIP_VMP === '1') {
    console.log(
      '[afterSign] PPLAYER_SKIP_VMP=1 のため VMP 署名をスキップします（Spotify BGM は連続再生できません）'
    )
    return
  }

  // appOutDir は生成された .app を含む親ディレクトリ。
  // castlabs_evs.vmp sign-pkg は「.app を含むディレクトリ」を受け取り中の *.app を検出する。
  const appOutDir = context.appOutDir
  console.log(`[afterSign] VMP 署名を適用します: ${appOutDir}`)
  execFileSync('python3', ['-m', 'castlabs_evs.vmp', '-n', 'sign-pkg', appOutDir], {
    stdio: 'inherit'
  })
  console.log('[afterSign] VMP 署名が完了しました')
}

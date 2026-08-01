// electron-builder afterSign フック。
// macOS のコード署名（ad-hoc）後に castLabs VMP 署名を適用する。
// Widevine（Spotify Web Playback SDK）を本番アプリで機能させるために必須。
// 事前に castlabs-evs のセットアップと EVS アカウント認証が済んでいること（WIDEVINE.md 参照）。
const { execFileSync } = require('child_process')

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  // appOutDir は生成された .app を含む親ディレクトリ。
  // castlabs_evs.vmp sign-pkg は「.app を含むディレクトリ」を受け取り中の *.app を検出する。
  const appOutDir = context.appOutDir
  console.log(`[afterSign] VMP 署名を適用します: ${appOutDir}`)
  execFileSync('python3', ['-m', 'castlabs_evs.vmp', '-n', 'sign-pkg', appOutDir], {
    stdio: 'inherit'
  })
  console.log('[afterSign] VMP 署名が完了しました')
}

// Stream Deck / グローバルショートカット一覧（表示用の単一の真実源）。
// 実際の登録は src/main/globalShortcuts.ts。両者が一致するよう、
// ここを編集したら登録側（アクセラレータと REGISTERED_SHORTCUT_COUNT）も必ず更新すること。
// BGM 操作（B / N / V）は「現在再生中のソース」に適用される（ローカル / Spotify のどちらでも）。
export const STREAM_DECK_SHORTCUTS = [
  ['F13', 'shortcut.go'],
  ['F16', 'shortcut.stopToStandby'],
  ['F17', 'shortcut.blackout'],
  ['F18', 'shortcut.ftb'],
  ['F19 / F20', 'shortcut.slideshowPreviousNext'],
  ['Control+Alt+P', 'shortcut.playPause'],
  ['Control+Alt+1〜9 / 0', 'shortcut.fireCues1To10'],
  ['Control+Alt+Shift+1〜9 / 0', 'shortcut.fireCues11To20'],
  ['Control+Alt+↑ / ↓', 'shortcut.masterVolume'],
  ['Control+Alt+M', 'shortcut.masterMute'],
  ['Control+Alt+B', 'shortcut.bgmPlayPause'],
  ['Control+Alt+N', 'shortcut.bgmNext'],
  ['Control+Alt+V', 'shortcut.bgmPrevious']
] as const

// 実際に登録されるアクセラレータの総数（globalShortcuts.ts と一致させること）。
// F系6 + Control+Alt+P + Up/Down/M(3) + B/N/V(3) + 数字10 + Shift数字10 = 33
export const REGISTERED_SHORTCUT_COUNT = 33

// Stream Deck / グローバルショートカット一覧（表示用の単一の真実源）。
// 実際の登録は src/main/globalShortcuts.ts。両者が一致するよう、
// ここを編集したら登録側（アクセラレータと REGISTERED_SHORTCUT_COUNT）も必ず更新すること。
// BGM 操作（B / N / V）は「現在再生中のソース」に適用される（ローカル / Spotify のどちらでも）。
export const STREAM_DECK_SHORTCUTS = [
  ['F13', 'GO'],
  ['F16', '停止（蓋絵へ）'],
  ['F17', 'ブラックアウト'],
  ['F18', 'FTB'],
  ['F19 / F20', '前へ / 次へ（スライドショー）'],
  ['Control+Alt+P', '再生 / 一時停止'],
  ['Control+Alt+1〜9 / 0', 'キュー1〜10を即時発火'],
  ['Control+Alt+Shift+1〜9 / 0', 'キュー11〜20を即時発火'],
  ['Control+Alt+↑ / ↓', 'マスター音量 +5% / −5%'],
  ['Control+Alt+M', 'マスターミュート'],
  ['Control+Alt+B', 'BGM 再生 / 一時停止（現在のソース）'],
  ['Control+Alt+N', 'BGM 次の曲（現在のソース）'],
  ['Control+Alt+V', 'BGM 前の曲（現在のソース）']
] as const

// 実際に登録されるアクセラレータの総数（globalShortcuts.ts と一致させること）。
// F系6 + Control+Alt+P + Up/Down/M(3) + B/N/V(3) + 数字10 + Shift数字10 = 33
export const REGISTERED_SHORTCUT_COUNT = 33

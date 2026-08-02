import type { Locale } from './types'

export type { Locale } from './types'

export const LOCALES: readonly Locale[] = ['ja', 'en'] as const

type Messages = Record<string, string>

const ja: Messages = {
  'app.title': 'pplayer',
  'app.subtitle': 'ライブ演出コントロール',
  'mode.label': '画面モード',
  'mode.show': '本番',
  'mode.setup': '準備',
  'status.playing': '再生中',
  'status.paused': '一時停止',
  'status.blackout': 'ブラックアウト',
  'status.standby': '待機',
  'header.outputLock': '出力ロック',
  'header.outputLockRelease': 'ロック中（解除）',
  'header.outputLockBadge': '出力ロック中',
  'header.save': '保存',
  'header.load': '読み込み',
  'setup.navLabel': '準備メニュー',
  'setup.nav.materials': '素材ライブラリ',
  'setup.nav.bgm': 'BGM',
  'setup.nav.stage': 'ステージ出力',
  'setup.nav.audio': '音声',
  'setup.nav.export': '書き出し',
  'setup.nav.remote': 'リモート',
  'setup.nav.display': '表示',
  'language.heading': '表示言語',
  'language.label': '言語',
  'language.ja': '日本語',
  'language.en': 'English',
  'transport.heading': '再生操作',
  'transport.previous': '◀ 前へ',
  'transport.previousTitle': '前の写真（←）',
  'transport.play': '▶ 再生',
  'transport.pause': 'Ⅱ 一時停止',
  'transport.next': '次へ ▶',
  'transport.nextTitle': '次の写真（→）',
  'transport.blackout': '● ブラックアウト',
  'transport.blackoutTitle': 'ブラックアウト（B）',
  'transport.ftb': 'FTB',
  'transport.ftbRelease': 'FTB 解除',
  'transport.ftbTitle': '黒へフェードして一時停止(F)',
  'transport.ftbReleaseTitle': 'FTB を解除して停止位置から再開(F)',
  'transport.activeCue': '実行中: {name}',
  'transport.standby': '蓋絵 / 待機',
  'transport.masterVolume': 'マスター音量',
  'transport.masterVolumeHint': '映像・BGM 全体（Spotify 含む）',
  'transport.muted': 'ミュート中',
  'transport.audioFallback': '⚠ 音声を出力できないため消音で再生中',
  'transport.blackoutHint': 'B キーでブラックアウト解除',
  'transport.ftbHeld': 'FTB 保持中',
  'transport.ftbRunning': 'FTB 実行中',
  'transport.progressLabel': '進行',
  'transport.progress': '{current} / 全{total}枚',
  'transport.phaseLabel': 'フェーズ',
  'transport.phase.fadeIn': 'フェードイン',
  'transport.phase.hold': '表示',
  'transport.phase.fadeOut': 'フェードアウト',
  'transport.phase.black': '—',
  'transport.remainingLabel': 'この写真の残り',
  'transport.seconds': '{seconds}秒',
  'transport.totalDuration': '全体所要時間'
}

const en: Messages = {
  'app.title': 'pplayer',
  'app.subtitle': 'Live Show Control',
  'mode.label': 'Mode',
  'mode.show': 'Show',
  'mode.setup': 'Setup',
  'status.playing': 'Playing',
  'status.paused': 'Paused',
  'status.blackout': 'Blackout',
  'status.standby': 'Standby',
  'header.outputLock': 'Output Lock',
  'header.outputLockRelease': 'Locked (Unlock)',
  'header.outputLockBadge': 'Output Locked',
  'header.save': 'Save',
  'header.load': 'Load',
  'setup.navLabel': 'Setup menu',
  'setup.nav.materials': 'Material Library',
  'setup.nav.bgm': 'BGM',
  'setup.nav.stage': 'Stage Output',
  'setup.nav.audio': 'Audio',
  'setup.nav.export': 'Export',
  'setup.nav.remote': 'Remote',
  'setup.nav.display': 'Display',
  'language.heading': 'Display Language',
  'language.label': 'Language',
  'language.ja': '日本語',
  'language.en': 'English',
  'transport.heading': 'Playback Controls',
  'transport.previous': '◀ Previous',
  'transport.previousTitle': 'Previous photo (←)',
  'transport.play': '▶ Play',
  'transport.pause': 'Ⅱ Pause',
  'transport.next': 'Next ▶',
  'transport.nextTitle': 'Next photo (→)',
  'transport.blackout': '● Blackout',
  'transport.blackoutTitle': 'Blackout (B)',
  'transport.ftb': 'FTB',
  'transport.ftbRelease': 'Release FTB',
  'transport.ftbTitle': 'Fade to black and pause (F)',
  'transport.ftbReleaseTitle': 'Release FTB and resume (F)',
  'transport.activeCue': 'Active: {name}',
  'transport.standby': 'Standby Image / Idle',
  'transport.masterVolume': 'Master Volume',
  'transport.masterVolumeHint': 'All video & BGM (incl. Spotify)',
  'transport.muted': 'Muted',
  'transport.audioFallback': '⚠ Muted: audio output unavailable',
  'transport.blackoutHint': 'Press B to exit blackout',
  'transport.ftbHeld': 'FTB Held',
  'transport.ftbRunning': 'FTB Running',
  'transport.progressLabel': 'Progress',
  'transport.progress': '{current} / {total}',
  'transport.phaseLabel': 'Phase',
  'transport.phase.fadeIn': 'Fade In',
  'transport.phase.hold': 'Hold',
  'transport.phase.fadeOut': 'Fade Out',
  'transport.phase.black': '—',
  'transport.remainingLabel': 'Photo Remaining',
  'transport.seconds': '{seconds}s',
  'transport.totalDuration': 'Total Duration'
}

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const message = (locale === 'en' ? en : ja)[key] ?? ja[key] ?? key
  if (!params) return message
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name]
    return value === undefined ? placeholder : String(value)
  })
}

export function plural(n: number, one: string, other: string): string {
  return n === 1 ? one : other
}

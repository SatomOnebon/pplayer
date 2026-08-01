import { globalShortcut } from 'electron'
import type { PlaybackCommand, SpotifyControlAction } from '../shared/types'
import type { AppStateStore } from './state'
import type { RemoteActions } from './remoteActions'
import { sendSpotifyControl } from './windows'

export const STREAM_DECK_SHORTCUTS = [
  ['F13', 'GO'],
  ['F16', '停止（蓋絵へ）'],
  ['F17', 'ブラックアウト'],
  ['F18', 'FTB'],
  ['F19 / F20', '前へ / 次へ（スライドショー）'],
  ['Control+Alt+P', '再生 / 一時停止'],
  ['Control+Alt+1〜9 / 0', 'キュー1〜10を即時発火'],
  ['Control+Alt+Shift+1〜9 / 0', 'キュー11〜20を即時発火'],
  ['Control+Alt+Up / Down', 'マスター音量 +5% / −5%'],
  ['Control+Alt+M', 'マスターミュート'],
  ['Control+Alt+B', 'BGM 再生/一時停止'],
  ['Control+Alt+N', 'BGM 次の曲'],
  ['Control+Alt+V', 'BGM 前の曲']
] as const

export function registerGlobalShortcuts(
  stateStore: AppStateStore,
  actions: RemoteActions
): string[] {
  globalShortcut.unregisterAll()
  const failed: string[] = []
  const commands: Array<[string, PlaybackCommand, boolean?]> = [
    ['F13', { type: 'go' }],
    ['F16', { type: 'stopToStandby' }],
    ['F17', { type: 'toggleBlackout' }],
    ['F18', { type: 'masterFtb' }],
    ['F19', { type: 'prev' }],
    ['F20', { type: 'next' }],
    ['Control+Alt+P', { type: 'playPause' }],
    [
      'Control+Alt+Down',
      {
        type: 'setMasterVolume',
        volume: Math.max(0, stateStore.getState().masterVolume - 0.05)
      }
    ],
    [
      'Control+Alt+Up',
      {
        type: 'setMasterVolume',
        volume: Math.min(1, stateStore.getState().masterVolume + 0.05)
      }
    ],
    ['Control+Alt+M', { type: 'setMasterVolume', volume: 0 }, true]
  ]
  for (const [accelerator, command, mute] of commands) {
    register(
      accelerator,
      () => {
        const current =
          command.type === 'setMasterVolume' && accelerator !== 'Control+Alt+M'
            ? {
                ...command,
                volume:
                  Math.round(
                    Math.min(
                      1,
                      Math.max(
                        0,
                        stateStore.getState().masterVolume +
                          (accelerator === 'Control+Alt+Up' ? 0.05 : -0.05)
                      )
                    ) * 100
                  ) / 100
              }
            : command
        actions.apply(current, mute)
      },
      failed
    )
  }
  for (const [accelerator, action] of [
    ['Control+Alt+B', 'playPause'],
    ['Control+Alt+N', 'next'],
    ['Control+Alt+V', 'previous']
  ] as const satisfies ReadonlyArray<readonly [string, SpotifyControlAction]>) {
    register(accelerator, () => sendSpotifyControl(action), failed)
  }
  for (const [acceleratorPrefix, offset] of [
    ['Control+Alt', 0],
    ['Control+Alt+Shift', 10]
  ] as const) {
    for (let digitIndex = 0; digitIndex < 10; digitIndex += 1) {
      register(
        `${acceleratorPrefix}+${(digitIndex + 1) % 10}`,
        () => {
          const cue = stateStore.getState().cues[offset + digitIndex]
          if (cue) actions.apply({ type: 'fireCue', id: cue.id })
        },
        failed
      )
    }
  }
  return failed
}

function register(accelerator: string, callback: () => void, failed: string[]): void {
  if (!globalShortcut.register(accelerator, callback)) {
    failed.push(accelerator)
    console.warn(`グローバルショートカット ${accelerator} を登録できませんでした`)
  }
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}

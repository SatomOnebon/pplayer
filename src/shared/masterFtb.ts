import type { AppState, PlaybackCommand, PlaybackStatus } from './types'

export function interruptsMasterFtb(command: PlaybackCommand): boolean {
  return (
    command.type === 'toggleBlackout' ||
    command.type === 'stopToStandby' ||
    command.type === 'go' ||
    command.type === 'fireCue'
  )
}

export function exitsFtbHeld(command: PlaybackCommand): boolean {
  return (
    command.type === 'go' ||
    command.type === 'fireCue' ||
    command.type === 'stopToStandby' ||
    command.type === 'toggleBlackout'
  )
}

export function discardsPendingTransition(command: PlaybackCommand): boolean {
  return command.type === 'masterFtb' || command.type === 'toggleBlackout'
}

export function holdMasterFtb(
  state: Pick<AppState, 'status' | 'baseTimestamp' | 'pausedElapsedMs'>,
  now: number
): Pick<AppState, 'status' | 'baseTimestamp' | 'pausedElapsedMs' | 'ftbHeld'> {
  const elapsed =
    state.baseTimestamp !== null ? Math.max(0, now - state.baseTimestamp) : state.pausedElapsedMs
  return {
    status: state.status === 'playing' ? 'paused' : state.status,
    baseTimestamp: null,
    pausedElapsedMs: elapsed,
    ftbHeld: true
  }
}

export function resumeMasterFtb(
  pausedElapsedMs: number,
  resumeStatus: Exclude<PlaybackStatus, 'blackout'>,
  now: number
): Pick<AppState, 'status' | 'baseTimestamp' | 'ftbHeld'> {
  return {
    status: resumeStatus,
    baseTimestamp: resumeStatus === 'paused' ? null : now - pausedElapsedMs,
    ftbHeld: false
  }
}

export function toggleBlackoutState(
  state: Pick<AppState, 'status' | 'baseTimestamp' | 'pausedElapsedMs'>,
  previousStatus: Exclude<PlaybackStatus, 'blackout'>,
  now: number
): {
  state: Pick<AppState, 'status' | 'baseTimestamp' | 'pausedElapsedMs'>
  previousStatus: Exclude<PlaybackStatus, 'blackout'>
} {
  if (state.status === 'blackout') {
    return {
      state: {
        ...state,
        status: previousStatus,
        baseTimestamp:
          previousStatus === 'playing' || previousStatus === 'idle'
            ? now - state.pausedElapsedMs
            : state.baseTimestamp
      },
      previousStatus
    }
  }
  return {
    state: {
      status: 'blackout',
      baseTimestamp: null,
      pausedElapsedMs:
        state.baseTimestamp !== null
          ? Math.max(0, now - state.baseTimestamp)
          : state.pausedElapsedMs
    },
    previousStatus: state.status
  }
}

export function beginMasterFtb(
  direction: NonNullable<AppState['ftb']>['direction'],
  durationMs: number,
  now = Date.now()
): NonNullable<AppState['ftb']> {
  return { startedAt: now, durationMs: normalizeFtbDurationMs(durationMs), direction }
}

export function masterFtbOpacity(ftb: AppState['ftb'], held = false, now = Date.now()): number {
  if (!ftb) return held ? 0 : 1
  const progress =
    ftb.durationMs <= 0 ? 1 : Math.max(0, Math.min(1, (now - ftb.startedAt) / ftb.durationMs))
  return ftb.direction === 'down' ? 1 - progress : progress
}

export function normalizeFtbDurationMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1500
  return Math.max(100, Math.round(value / 100) * 100)
}

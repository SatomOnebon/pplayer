import {
  buildCycles,
  computeTimeline,
  resolvePhotoIndex,
  type TimelineResult
} from '../../../shared/timeline'
import type { FitMode, PhotoItem } from '../../../shared/types'
import type { EditingAppState } from '../../../shared/migration'
import { stillFadeInOpacity } from '../../../shared/stillFade'

export interface PlaybackFrame {
  elapsedMs: number
  photo: PhotoItem | null
  fit: FitMode
  photoIndex: number | null
  playablePhotos: PhotoItem[]
  timeline: TimelineResult
}

const BLACK_TIMELINE: TimelineResult = {
  photoOffset: 0,
  phase: 'black',
  opacity: 0,
  finished: true
}

export function resolvePlaybackFrame(state: EditingAppState, now = Date.now()): PlaybackFrame {
  const activeCue = state.cues.find((cue) => cue.id === state.activeCueId)
  const slideshow =
    activeCue?.materialType === 'slideshow'
      ? state.materials.slideshows.find((material) => material.id === activeCue.materialId)
      : null
  const playablePhotos = (slideshow?.photos ?? []).filter((photo) => !photo.excluded)
  const elapsedMs =
    state.status === 'playing' && state.baseTimestamp !== null
      ? Math.max(0, now - state.baseTimestamp)
      : state.pausedElapsedMs

  if (state.status === 'blackout') {
    return {
      elapsedMs,
      photo: null,
      fit: slideshow?.fit ?? 'contain',
      photoIndex: null,
      playablePhotos,
      timeline: BLACK_TIMELINE
    }
  }

  if (!activeCue || activeCue.materialType === 'still' || activeCue.materialType === 'black') {
    if (activeCue?.materialType === 'black') {
      return {
        elapsedMs,
        photo: null,
        fit: 'contain',
        photoIndex: null,
        playablePhotos: [],
        timeline: BLACK_TIMELINE
      }
    }
    const stillId =
      activeCue?.materialType === 'still' ? activeCue.materialId : state.standbyStillId
    const still = state.materials.stills.find((material) => material.id === stillId)
    const photo: PhotoItem | null =
      still?.kind === 'image'
        ? {
            id: still.id,
            filePath: still.filePath,
            fileName: still.name,
            excluded: false,
            fit: null,
            fadeInMs: null,
            holdMs: null,
            fadeOutMs: null,
            reloadToken: still.reloadToken
          }
        : null
    return {
      elapsedMs,
      photo,
      fit: still?.fit ?? 'contain',
      photoIndex: photo ? 0 : null,
      playablePhotos: photo ? [photo] : [],
      timeline: photo
        ? {
            ...BLACK_TIMELINE,
            phase: 'hold',
            opacity:
              activeCue?.materialType === 'still'
                ? stillFadeInOpacity(state.baseTimestamp, activeCue.fadeInMs, now)
                : 1,
            finished: false
          }
        : BLACK_TIMELINE
    }
  }

  if (!slideshow || playablePhotos.length === 0 || state.status === 'idle') {
    return {
      elapsedMs,
      photo: null,
      fit: slideshow?.fit ?? 'contain',
      photoIndex: null,
      playablePhotos,
      timeline: BLACK_TIMELINE
    }
  }

  const loop = activeCue.endBehavior === 'loop'
  const cycles = buildCycles(playablePhotos, slideshow.timing, state.baseIndex, loop)
  const timeline = computeTimeline(elapsedMs, cycles, loop)
  const photoIndex = resolvePhotoIndex(
    state.baseIndex,
    timeline.photoOffset,
    playablePhotos.length,
    loop
  )

  const photo = !timeline.finished && photoIndex !== null ? playablePhotos[photoIndex] : null

  return {
    elapsedMs,
    photo,
    fit: photo?.fit ?? slideshow.fit,
    photoIndex: timeline.finished ? null : photoIndex,
    playablePhotos,
    timeline
  }
}

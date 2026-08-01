import assert from 'node:assert/strict'
import { test } from 'node:test'

import { migrateBlackStillMaterials, migrateV1State, migrateVideoFades } from './migration.ts'

test('v1 state を既定スライドショー素材と参照キューへ完全移行する', () => {
  let sequence = 0
  const state = migrateV1State(
    {
      photos: [
        {
          id: 'photo-1',
          filePath: '/show/a.jpg',
          fileName: 'a.jpg',
          excluded: true,
          fit: 'cover',
          fadeInMs: 300,
          holdMs: 2_000,
          fadeOutMs: 400
        }
      ],
      timing: {
        fadeInMs: 1_000,
        holdMs: 4_000,
        fadeOutMs: 1_000,
        fadeInEase: 'easeIn',
        fadeOutEase: 'easeOut'
      },
      fit: 'cover',
      loop: false,
      mask: {
        mode: 'image',
        imagePath: '/show/mask.png',
        invert: true,
        sizePercent: 88,
        offsetXPercent: 3,
        offsetYPercent: -2
      },
      baseIndex: 9
    },
    () => `generated-${++sequence}`
  )

  assert.equal(state.materials.slideshows.length, 1)
  assert.deepEqual(state.materials.slideshows[0], {
    id: 'generated-1',
    name: 'スライドショー1',
    photos: [
      {
        id: 'photo-1',
        filePath: '/show/a.jpg',
        fileName: 'a.jpg',
        excluded: true,
        fit: 'cover',
        fadeInMs: 300,
        holdMs: 2_000,
        fadeOutMs: 400
      }
    ],
    timing: {
      fadeInMs: 1_000,
      holdMs: 4_000,
      fadeOutMs: 1_000,
      fadeInEase: 'easeIn',
      fadeOutEase: 'easeOut'
    },
    fit: 'cover'
  })
  assert.deepEqual(state.cues, [
    {
      id: 'generated-2',
      label: 'スライドショー1',
      materialType: 'slideshow',
      materialId: 'generated-1',
      endBehavior: 'loop'
    }
  ])
  assert.equal(state.editingSlideshowId, 'generated-1')
  assert.equal(state.masterVolume, 1)
  assert.equal(state.stageAspect, 'free')
  assert.deepEqual(state.mask, {
    mode: 'image',
    imagePath: '/show/mask.png',
    invert: true,
    sizePercent: 88,
    offsetXPercent: 3,
    offsetYPercent: -2
  })
  assert.equal(state.baseIndex, 0)
  assert.equal(state.status, 'idle')
})

test('旧 v2 の動画素材フェードを全参照キューへ移しキュー既存値を優先する', () => {
  const migrated = migrateVideoFades({
    materials: {
      slideshows: [],
      videos: [
        {
          id: 'video-1',
          name: '本編',
          filePath: '/show/main.mp4',
          volume: 1,
          fit: 'contain',
          fadeInMs: 1_200,
          fadeOutMs: 2_300
        }
      ],
      stills: []
    },
    cues: [
      {
        id: 'cue-1',
        label: '本編 A',
        materialType: 'video',
        materialId: 'video-1',
        endBehavior: 'advance'
      },
      {
        id: 'cue-2',
        label: '本編 B',
        materialType: 'video',
        materialId: 'video-1',
        endBehavior: 'hold',
        fadeInMs: 400,
        fadeOutMs: 500
      }
    ]
  } as Parameters<typeof migrateVideoFades>[0])

  assert.deepEqual(migrated.cues, [
    {
      id: 'cue-1',
      label: '本編 A',
      materialType: 'video',
      materialId: 'video-1',
      endBehavior: 'advance',
      fadeInMs: 1_200,
      fadeOutMs: 2_300
    },
    {
      id: 'cue-2',
      label: '本編 B',
      materialType: 'video',
      materialId: 'video-1',
      endBehavior: 'hold',
      fadeInMs: 400,
      fadeOutMs: 500
    }
  ])
  assert.equal('fadeInMs' in migrated.materials.videos[0], false)
  assert.equal('fadeOutMs' in migrated.materials.videos[0], false)
})

test('旧 v2 の黒静止画素材を除去して参照キューを black キューへ移行する', () => {
  const migrated = migrateBlackStillMaterials({
    materials: {
      slideshows: [],
      videos: [],
      stills: [
        { id: 'cover', name: '蓋絵', kind: 'image', filePath: '/cover.png', fit: 'contain' },
        { id: 'black', name: '旧黒画面', kind: 'black', fit: 'contain' }
      ]
    },
    cues: [
      {
        id: 'cue-black',
        label: '暗転',
        materialType: 'still',
        materialId: 'black',
        endBehavior: 'hold',
        fadeInMs: 300,
        fadeOutMs: 700
      },
      {
        id: 'cue-cover',
        label: '蓋絵',
        materialType: 'still',
        materialId: 'cover',
        endBehavior: 'hold',
        fadeInMs: 0,
        fadeOutMs: 0
      }
    ],
    standbyStillId: 'black'
  })

  assert.deepEqual(migrated.materials.stills, [
    { id: 'cover', name: '蓋絵', kind: 'image', filePath: '/cover.png', fit: 'contain' }
  ])
  assert.deepEqual(migrated.cues, [
    {
      id: 'cue-black',
      label: '暗転',
      materialType: 'black',
      endBehavior: 'hold',
      fadeInMs: 300,
      fadeOutMs: 700
    },
    {
      id: 'cue-cover',
      label: '蓋絵',
      materialType: 'still',
      materialId: 'cover',
      endBehavior: 'hold',
      fadeInMs: 0,
      fadeOutMs: 0
    }
  ])
  assert.equal(migrated.standbyStillId, null)
})

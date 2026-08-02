[日本語](AGENTS.md) | [English](AGENTS.en.md)

# pplayer — Live Production Player with Circular Masks

A macOS Electron app for projecting videos and photos onto a circular screen at live events.
It opens a control window on the MacBook and a fullscreen display window on the projector (external display).

## v2 Architecture: Materials + Cue List (Extended 2026-07-26)

Extends the v1 "single slideshow" model into a two-layer **material library + cue list** structure.

### Materials

- **Slideshow material**: Named. Holds a photo list (including exclusions and per-photo fit/timing overrides), global timing (fadeIn/hold/fadeOut + ease), and a default fit. Multiple slideshow materials are supported.
- **Video material**: References an mp4/mov file and has per-material volume.
- **Still-image material**: A single image, used for purposes such as the standby image.
- Mask settings (mode, inversion, size, and offset) remain **global** because they are tied to the physical screen and do not belong to materials.

### Cue List

- A cue is a reference to a material plus cue-specific settings. Multiple cues can reference the same material; this is the central idea of v2.
- Cue-specific settings:
  - Slideshow cue: End behavior is `loop` (advance manually) / `advance` (automatically advance to the next cue after one cycle) / `toStandby` (return to the standby image after one cycle).
  - Video cue: End behavior is `advance` / `toStandby` / `hold` (freeze on the last frame).
  - Still-image cue: Remains visible until GO advances to the next cue.
- **Standby image**: A special slot. One still-image material can be designated as the standby image. When nothing is playing, show it instead of black; show black if none is assigned. A single key can return the output to standby.
- **Progression**: GO-style operation (Space triggers the next cue), plus instant jumps by double-clicking any cue. Clearly show the current and next cues in the control window.
- Priority: blackout > active cue > standby image.

### Playback Engine

- The main process remains the SoT as in v1. AppState manages `activeCue` (id, material type, reference start time, etc.), `cues`, and `materials`.
- Slideshow playback uses the existing v1 timeline (`shared/timeline.ts`) and calls buildCycles with the material timing.
- Videos play in the display window's `<video>` element and are drawn onto canvas with rAF. **Videos and photos share the same mask compositing path** (compositor). The renderer reports playback position and completion to the main process only when playback ends, preserving the prohibition on per-frame IPC.
- Audio: Video audio is output from the display window. The output device can be selected in the app settings with `setSinkId`. Volume is configured per material.
- MP4 export operates **per slideshow material**, using the same pipeline as v1. Exporting the entire cue list is out of scope.

### Persistence and Migration

- electron-store / `.pplayer` uses version 2 (materials + cues + mask + standby + audio settings).
- On load, v1 data (version 1 / legacy store) is automatically converted into one "Slideshow 1" material and one cue referencing it.

## Requirements (Specifications Established in v1)

- Load approximately 80 photos, with possible growth, in jpg / png format.
- Fades **pass through black** rather than crossfading: 1.5s fade-in → 5.5s hold → 1.5s fade-out = 8.5s per photo. Each of the three values is adjustable in 0.1s increments. The values above are the defaults.
- Two mask modes: **built-in circle (default)** and **custom mask image (PNG)**.
  - Custom masks use the alpha channel (opaque = show photo, transparent = black). Grayscale images without alpha are interpreted by luminance (white = show).
  - Mask size (as a percentage of display height) and center X/Y offsets are adjustable in both modes.
- Controls: play/pause (Space), next (→), previous (←), blackout (B), loop playback toggle, drag-and-drop photo reordering, and checkbox exclusion (excluded photos remain in the list).
- In addition to real-time playback, export MP4 (H.264) at 1920×1080, 3840×2160, or a custom resolution. Default fps is 30.

## Architecture (Mandatory)

- Use **electron-vite + React + TypeScript**. There are two windows: `control` and `display`.
- **The main process (`src/main/`) is the source of truth for playback state**. It holds the playlist, current index, playback state (`idle | playing | paused | blackout`), timing settings, and mask settings, and broadcasts changes to both windows over IPC.
- **Per-frame IPC is prohibited**. The display window receives state plus a reference timestamp and interpolates opacity in its own `requestAnimationFrame` loop.
- **Centralize timeline calculation logic in `src/shared/`** and use the same functions in the display window, control-window preview, and export. Do not duplicate similar logic.
  - Core pure function: `(elapsed time in ms, timing settings, photo count, loop enabled) => { photo index, phase (fadeIn|hold|fadeOut|black), opacity }`
- **Use canvas compositing (`globalCompositeOperation: 'destination-in'`) for all mask processing**. The circle mode must also create a mask canvas containing a drawn circle and use the same rendering path. Do not use CSS clip-path, so exports match the display.
- **Place photos centered on the stage (the full output frame) using contain**, showing the entire photo and filling unused areas with black. The mask cuts out this composed image. Mask modes are `none | circle | image`.
- The display window uses the `screen` API to detect an external display and automatically enter fullscreen on it. If none is connected, use a normal window for development and preview. Respond to display connection and disconnection events.
- Export has two stages: ① compose each photo at the export resolution into a PNG with a black background, contain/cover placement on the stage (default contain with per-photo overrides), and mask clipping; ② use ffmpeg from `ffmpeg-static` to turn each PNG into a still clip with `-loop 1`, apply fade-in/out filters, and concatenate the clips into an H.264 MP4. Do not use a per-frame pipe.
- Persist playlists and settings with `electron-store`.
- Do not use Node APIs directly from renderers. Keep `contextIsolation: true` and expose APIs explicitly through `preload`.

## Coding Conventions

- Use TypeScript strict mode. Do not casually use `any`.
- Centralize type definitions (IPC channel names, payload types, and shared state types) in `src/shared/types.ts` and share them among main / preload / renderer.
- Write comments only for constraints and reasoning that cannot be inferred from the code. Do not add obvious comments.
- Minimize external dependencies. Do not add UI libraries or state-management libraries; React's standard features are sufficient at this scale. Use the standard HTML5 API for drag and drop.
- Provide UI strings in Japanese (default) and English through i18n (`src/shared/i18n.ts`). Do not hardcode new UI strings; always add a dictionary key and access it with `t()`/`useT()`/`mt()`. The default locale is Japanese.

## Verification

- Confirm startup with `npm run dev`. After every change, `npx tsc --noEmit` (or `npm run typecheck`) must pass.

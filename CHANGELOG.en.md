[日本語](CHANGELOG.md) | [English](CHANGELOG.en.md)

# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-08-02

First public release.

### Added
- **Cue playback**: prepare photos, videos, and slideshows as cues and press GO to instantly project them onto a circular screen. Standby image, blackout, FTB, jump-to-any-cue; single-click to arm, double-click to fire.
- **Circular-mask projection**: a control window (MacBook) plus a display window (projector); circular / custom-image masks with position, size, and stage-aspect adjustment.
- **BGM playback**: switch between local audio playlists (suitable for commercial use) and Spotify (Web Playback SDK). Independent transport plus cue-linked auto-switching with fades; both crossfade and fade-out→fade-in modes. Mixer-style master volume over all video and BGM, and a shared output device for video and BGM.
- **Live-operation support**: output lock (disables live-output changes through every path), material reload (apply same-name replacements without restarting), muted material preview (videos openable with sound in an external player), and Stream Deck integration (global shortcuts + a local HTTP API).
- **MP4 export**: export slideshows as H.264 video.
- **Bilingual UI (Japanese / English)**: auto-detected from the OS and switchable in-app (Setup > Display). Documentation is provided in both languages.
- **macOS build**: castLabs Electron + VMP signing (for Spotify/Widevine). A Spotify-free build is possible without signing via `PPLAYER_SKIP_VMP=1`.

### Notes
- Distributed binaries are ad-hoc signed and not notarized; on first launch, right-click → Open.
- Spotify BGM requires your own Spotify **Premium** account and **Client ID** (entered in-app, not bundled).
- Public playback of music may require rights clearance; compliance is the user's responsibility (see `NOTICE.en.md`).

[Unreleased]: https://github.com/SatomOnebon/pplayer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/SatomOnebon/pplayer/releases/tag/v1.0.0

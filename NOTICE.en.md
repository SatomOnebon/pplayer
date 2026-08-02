[日本語](NOTICE.md) | [English](NOTICE.en.md)

# NOTICE / Third-Party Components and Trademarks

This software (pplayer) is distributed under the MIT License (see `LICENSE`).
It uses the following third-party components and services, each subject to its own terms.

## Spotify

- This app uses the Spotify **Web API** and **Web Playback SDK**, but is
  **not endorsed, certified, or otherwise approved by Spotify**
  ("This product uses the Spotify API/SDK but is not endorsed, certified, or otherwise
  approved by Spotify. Spotify is a trademark of Spotify AB.").
- Use requires your own **Spotify Premium account** and the **Client ID of an app you register in the Spotify Developer Dashboard**. This repository does not include a Client ID.
- Each user must agree to the **Spotify Developer Terms, Developer Policy, and Terms of Use**.
- **Important (user responsibility)**: Spotify's consumer Terms generally permit **personal, non-commercial use** only. **Public playback or performance** at events may violate Spotify's Terms. In addition, public performance of music may require **separate rights clearance (through JASRAC / NexTone, etc. in Japan)**. Compliance is **the user's responsibility**. This software provides no guarantee of compliance.

## Widevine / castLabs

- Because the Spotify Web Playback SDK requires EME/Widevine DRM, builds use **castLabs Electron (Electron for Content Security)** and **VMP signing (castlabs-evs)**.
- castLabs components and the Widevine CDM (Google) are subject to their respective providers' terms. The Widevine CDM is downloaded at runtime and is not redistributed in this repository. See `WIDEVINE.en.md` for details.

## FFmpeg (ffmpeg-static)

- Video export uses **FFmpeg** through `ffmpeg-static`. The bundled FFmpeg build is subject to FFmpeg's licenses, including **LGPL/GPL**. If a distribution includes the FFmpeg binary, comply with the applicable license terms, including source-code provision requirements.

## Other Components

- Electron, React, electron-vite, electron-store, @electron-toolkit, and other components are subject to their respective licenses, including MIT licenses.
- The app icon and Stream Deck icons (`build/`, `assets/streamdeck/`) are original works of this project.

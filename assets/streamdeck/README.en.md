[日本語](README.md) | [English](README.en.md)

# Stream Deck Icons (Spotify BGM Controls)

144×144 PNG files. Drag them onto buttons in the Stream Deck app to configure them.

| Icon | Action | Shortcut | HTTP API |
|---|---|---|---|
| `spotify-playpause.png` | Play / Pause | `Ctrl+Alt+B` | `/api/spotify/playpause` |
| `spotify-next.png` | Next track | `Ctrl+Alt+N` | `/api/spotify/next` |
| `spotify-prev.png` | Previous track | `Ctrl+Alt+V` | `/api/spotify/prev` |

## Assignment Methods (Two Options)

**A. HTTP API (recommended and reliable)**
Turn the HTTP API ON under "Remote Control" in the app, then send a GET request to one of the following URLs using Stream Deck's "System > Website" action or another HTTP action:
```
http://127.0.0.1:8722/api/spotify/playpause?token=<トークン>
http://127.0.0.1:8722/api/spotify/next?token=<トークン>
http://127.0.0.1:8722/api/spotify/prev?token=<トークン>
```
(The token placeholder is the value shown in the Remote Control panel.)

**B. Global Shortcuts**
Assign the keys in the table above to Stream Deck "Hotkey" actions.
(macOS Accessibility permission is required.)

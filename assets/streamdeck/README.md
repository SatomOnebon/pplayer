[日本語](README.md) | [English](README.en.md)

# Stream Deck アイコン（Spotify BGM 制御）

144×144 PNG。Stream Deck アプリのボタンにドラッグして設定してください。

| アイコン | 操作 | ショートカット | HTTP API |
|---|---|---|---|
| `spotify-playpause.png` | 再生 / 一時停止 | `Ctrl+Alt+B` | `/api/spotify/playpause` |
| `spotify-next.png` | 次の曲 | `Ctrl+Alt+N` | `/api/spotify/next` |
| `spotify-prev.png` | 前の曲 | `Ctrl+Alt+V` | `/api/spotify/prev` |

## 割り当て方（2通り）

**A. HTTP API（推奨・確実）**
アプリの「リモート制御」で HTTP API を ON にし、Stream Deck の
「System > Website」または HTTP を叩くアクションで下記 URL を GET:
```
http://127.0.0.1:8722/api/spotify/playpause?token=<トークン>
http://127.0.0.1:8722/api/spotify/next?token=<トークン>
http://127.0.0.1:8722/api/spotify/prev?token=<トークン>
```
（`<トークン>` はリモート制御パネルに表示されるもの）

**B. グローバルショートカット**
Stream Deck の「Hotkey」アクションに上表のキーを設定。
（macOS のアクセシビリティ許可が必要）

import { useEffect, useState } from 'react'
import type { PlaybackCommand } from '../../../shared/types'

export function AudioSettings({
  deviceId,
  send
}: {
  deviceId: string | null
  send: (command: PlaybackCommand) => void
}): React.JSX.Element {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    let active = true
    const refresh = (): void => {
      void navigator.mediaDevices
        ?.enumerateDevices()
        .then((items) => {
          if (active) setDevices(items.filter((item) => item.kind === 'audiooutput'))
        })
        .catch(() => undefined)
    }
    refresh()
    navigator.mediaDevices?.addEventListener('devicechange', refresh)
    return () => {
      active = false
      navigator.mediaDevices?.removeEventListener('devicechange', refresh)
    }
  }, [])
  return (
    <section className="panel audio-panel">
      <div className="panel-heading compact">
        <div>
          <h2>音声設定</h2>
          <span>動画の出力先</span>
        </div>
      </div>
      <label className="audio-device-field">
        <span>出力デバイス</span>
        <select
          value={deviceId ?? ''}
          onChange={(event) =>
            send({ type: 'setAudioOutputDevice', deviceId: event.target.value || null })
          }
        >
          <option value="">システム既定</option>
          {devices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `音声出力 ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}

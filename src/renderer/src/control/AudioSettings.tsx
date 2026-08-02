import { useEffect, useState } from 'react'
import type { PlaybackCommand } from '../../../shared/types'
import { useT } from '../i18n/LocaleProvider'

export function AudioSettings({
  deviceId,
  send
}: {
  deviceId: string | null
  send: (command: PlaybackCommand) => void
}): React.JSX.Element {
  const t = useT()
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
          <h2>{t('audio.heading')}</h2>
          <span>{t('audio.description')}</span>
        </div>
      </div>
      <label className="audio-device-field">
        <span>{t('audio.outputDevice')}</span>
        <select
          value={deviceId ?? ''}
          onChange={(event) =>
            send({ type: 'setAudioOutputDevice', deviceId: event.target.value || null })
          }
        >
          <option value="">{t('audio.systemDefault')}</option>
          {devices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || t('audio.outputNumber', { index: index + 1 })}
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}

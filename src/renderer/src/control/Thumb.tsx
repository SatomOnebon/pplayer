import { useState } from 'react'

export function Thumb({
  src,
  fallbackLabel
}: {
  src: string | null
  fallbackLabel?: string
}): React.JSX.Element {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = src !== null && failedSrc === src

  return (
    <div className="thumb">
      {src && !failed && (
        <img src={src} alt="" draggable={false} loading="lazy" onError={() => setFailedSrc(src)} />
      )}
      {fallbackLabel && (!src || failed) && <span>{fallbackLabel}</span>}
    </div>
  )
}

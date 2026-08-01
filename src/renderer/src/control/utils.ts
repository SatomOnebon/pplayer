export function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(1)
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 60_000) return `${seconds(milliseconds)}秒`
  const totalSeconds = Math.round(milliseconds / 1000)
  return `${Math.floor(totalSeconds / 60)}分${totalSeconds % 60}秒`
}

export function fileName(path: string | null): string {
  if (!path) return '未選択'
  return path.split(/[\\/]/).pop() ?? path
}

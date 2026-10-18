/**
 * Throttle model-download progress: one line per 10% step per file, and one at
 * 100%. The library reports every tick (hundreds of lines per download).
 * @param {(msg: string) => void} [log]
 * @returns {(progress: { file?: string, progress?: number }) => void}
 */
export function createLoadProgressLogger(log = console.log) {
  const lastBucket = new Map()
  return (progress) => {
    if (!progress.progress) return
    const pct = Math.round(progress.progress)
    const bucket = pct >= 100 ? 100 : Math.floor(pct / 10) * 10
    const key = progress.file ?? ''
    if (bucket > (lastBucket.get(key) ?? -1)) {
      lastBucket.set(key, bucket)
      log(`[Embeddings] Loading... ${bucket}%`)
    }
  }
}

// Only this disposable process loads Transformers / ONNX. The web server never
// imports them. The parent serializes all callers and sends at most two texts.
import { pipeline, env } from '@huggingface/transformers'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, cpSync } from 'node:fs'
import { processFootprint } from '../process-footprint.mjs'
import { createLoadProgressLogger } from './load-progress.mjs'

env.allowLocalModels = false
env.useBrowserCache = false
// Keep models outside .next: a production rebuild deletes .next/server.
// Migrate the previous cache when available; custom cache locations are left
// alone. The default follows ~/.aimaestro onto the company's state volume.
env.cacheDir = process.env.AIMAESTRO_EMBEDDING_CACHE_DIR || path.join(os.homedir(), '.aimaestro/cache/transformers')
// This file runs as a plain node script, so its own location is the repository root's lib/rag.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const oldModel = path.join(appRoot, '.next/server/.cache/Xenova/bge-small-en-v1.5')
const newModel = path.join(env.cacheDir, 'Xenova/bge-small-en-v1.5')
if (!process.env.AIMAESTRO_EMBEDDING_CACHE_DIR && existsSync(oldModel) && !existsSync(newModel)) {
  mkdirSync(path.dirname(newModel), { recursive: true })
  cpSync(oldModel, newModel, { recursive: true })
}

const positive = (name, fallback) => {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n > 0 ? n : fallback
}
const maxBatches = positive('AIMAESTRO_EMBEDDING_MAX_BATCHES', 64)
const maxBytes = positive('AIMAESTRO_EMBEDDING_MAX_MB', 512) * 1024 ** 2
let extractor
let batches = 0
let busy = false
let footprint = 0

process.on('disconnect', () => process.exit(0))
process.on('message', async ({ id, texts } = {}) => {
  if (busy || !Number.isInteger(id) || !Array.isArray(texts) || texts.length < 1 || texts.length > 2 ||
      texts.some(t => typeof t !== 'string' || !t.trim())) {
    process.send?.({ id, error: 'Invalid embedding request', retire: true })
    return
  }
  busy = true
  try {
    if (!extractor) {
      const started = Date.now()
      const logLoadProgress = createLoadProgressLogger()
      extractor = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', {
        dtype: 'q8',
        // CPU explicitly, not 'auto': on Linux 'auto' offers ONNX Runtime the
        // cuda provider first, onnxruntime-node ships CPU-only, and every batch
        // fails while the model download still looks healthy.
        // AIMAESTRO_EMBEDDING_DEVICE overrides on a CUDA-enabled build.
        device: process.env.AIMAESTRO_EMBEDDING_DEVICE || 'cpu',
        progress_callback: progress => {
          if (progress.status === 'progress') logLoadProgress(progress)
        },
      })
      console.log(`[Embeddings] Model loaded in ${Date.now() - started}ms (pid ${process.pid})`)
    }
    const output = await extractor(texts, { pooling: 'mean', normalize: true })
    let vectors
    try {
      if (!(output.data instanceof Float32Array) || output.dims[0] !== texts.length || output.dims[1] !== 384) {
        throw new Error('Unexpected embedding tensor shape')
      }
      vectors = texts.map((_, i) => {
        const row = output.data.slice(i * 384, (i + 1) * 384)
        const norm = Math.sqrt(row.reduce((sum, x) => sum + x * x, 0)) || 1
        for (let j = 0; j < row.length; j++) row[j] /= norm
        return row
      })
    } finally {
      output.dispose()
    }
    batches++
    // Bound lifetime even if a native allocator's growth is hidden by swap.
    // Sample macOS's actual footprint occasionally; peak RSS is a cheap check
    // on every batch and includes peaks that happened between samples.
    if (batches % 16 === 0) {
      try { footprint = await processFootprint() }
      catch (error) { console.warn('[Embeddings] Footprint sample failed:', error.message) }
    }
    const rss = process.memoryUsage().rss
    const peakRss = process.resourceUsage().maxRSS * 1024
    process.send?.({ id, vectors, retire: batches >= maxBatches || Math.max(rss, peakRss, footprint) >= maxBytes,
      metrics: { pid: process.pid, batches, rss, footprint } })
  } catch (error) {
    process.send?.({ id, error: error.message || String(error), retire: true })
  } finally {
    busy = false
  }
})

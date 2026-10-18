import { fork } from 'node:child_process'
import path from 'node:path'

/** One queue per server process, shared across Next bundles via globalThis. */
export class EmbeddingClient {
  constructor({ workerPath = path.join(process.cwd(), 'lib/rag/embedding-worker.mjs'),
    idleMs = 30_000, timeoutMs = 120_000, maxPending = 64, maxPendingBytes = 16 * 1024 ** 2,
    workerEnv = {}, spawn = fork } = {}) {
    this.options = { workerPath, idleMs, timeoutMs, maxPending, maxPendingBytes, workerEnv, spawn }
    this.queue = []
    this.active = null
    this.child = null
    this.retiring = false
    this.closed = false
    this.bytes = 0
    this.nextId = 0
    this.idleTimer = null
    this.metrics = null
  }

  /** @param {string[]} texts @returns {Promise<Float32Array[]>} */
  async embedTexts(texts) {
    const valid = texts.filter(t => typeof t === 'string' && t.trim())
    if (!valid.length) throw new Error('[Embeddings] No valid texts to embed')
    const results = []
    for (let i = 0; i < valid.length; i += 2) {
      results.push(...await this.enqueue(valid.slice(i, i + 2)))
    }
    return results
  }

  enqueue(texts) {
    if (this.closed) return Promise.reject(new Error('Embedding worker is closed'))
    const bytes = texts.reduce((sum, text) => sum + Buffer.byteLength(text), 0)
    if (this.queue.length + Number(Boolean(this.active)) >= this.options.maxPending ||
        this.bytes + bytes > this.options.maxPendingBytes) {
      return Promise.reject(new Error('Embedding queue is full; retry later'))
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ id: ++this.nextId, texts, bytes, resolve, reject, timer: null })
      this.bytes += bytes
      this.pump()
    })
  }

  pump() {
    if (this.closed || this.active || this.retiring) return
    clearTimeout(this.idleTimer)
    if (!this.queue.length) {
      if (this.child) {
        this.child.unref()
        this.child.channel?.unref()
        this.idleTimer = setTimeout(() => this.retire(), this.options.idleMs)
        this.idleTimer.unref()
      }
      return
    }
    const job = this.active = this.queue.shift()
    try {
      if (!this.child) {
        const child = this.child = this.options.spawn(this.options.workerPath, [], {
          execArgv: [], serialization: 'advanced',
          env: { ...process.env, ...this.options.workerEnv },
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        })
        child.on('message', msg => this.receive(child, msg))
        child.on('error', error => this.fail(child, error))
        // 'close' also fires after a spawn failure, where 'exit' does not.
        child.on('close', (code, signal) => {
          if (this.child !== child) return
          this.finish(new Error(`Embedding worker exited (${signal || code})`))
          this.child = null
          this.retiring = false
          this.pump()
        })
      }
      this.child.ref()
      this.child.channel?.ref()
      const child = this.child
      job.timer = setTimeout(() => this.fail(child, new Error('Embedding worker timed out')), this.options.timeoutMs)
      child.send({ id: job.id, texts: job.texts }, error => { if (error) this.fail(child, error) })
    } catch (error) {
      this.finish(error)
      if (this.child) this.retire()
      else this.pump()
    }
  }

  receive(child, msg) {
    if (child !== this.child || !this.active || msg?.id !== this.active.id) return
    if (msg.retire || msg.error) this.retiring = true
    this.metrics = msg.metrics || this.metrics
    const valid = Array.isArray(msg.vectors) && msg.vectors.length === this.active.texts.length &&
      msg.vectors.every(v => v instanceof Float32Array && v.length === 384 && v.every(Number.isFinite))
    if (msg.error || !valid) {
      this.retiring = true
      this.finish(new Error(msg.error || 'Invalid embedding worker response'))
    } else {
      this.finish(null, msg.vectors)
    }
    if (this.retiring) this.retire()
    else this.pump()
  }

  finish(error, vectors) {
    const job = this.active
    if (!job) return
    this.active = null
    clearTimeout(job.timer)
    this.bytes -= job.bytes
    if (error) job.reject(error)
    else job.resolve(vectors)
  }

  fail(child, error) {
    if (this.child !== child) return
    this.retiring = true
    this.finish(error)
    this.retire()
  }

  retire() {
    clearTimeout(this.idleTimer)
    if (!this.child) return
    this.retiring = true
    // Wait for exit before spawning a replacement: never overlap model copies.
    this.child.kill('SIGKILL')
  }

  close() {
    this.closed = true
    this.finish(new Error('Embedding worker is closed'))
    for (const job of this.queue.splice(0)) {
      this.bytes -= job.bytes
      job.reject(new Error('Embedding worker is closed'))
    }
    this.retire()
  }
}

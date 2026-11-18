import { describe, it, expect, afterAll } from 'vitest'
import http from 'http'
import zlib from 'zlib'
import type { AddressInfo } from 'net'
import { compressJson } from '@/lib/json-compression.mjs'

const big = JSON.stringify({ agents: Array.from({ length: 500 }, (_, i) => ({ id: i, name: `agent-${i}`, status: 'ready' })) })

const server = http.createServer((req, res) => {
  compressJson(req, res)
  if (req.url === '/sse') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.end(`data: ${big}\n\n`)
    return
  }
  res.setHeader('Content-Type', 'application/json')
  res.end(req.url === '/small' ? '{"ok":true}' : big)
})
const ready = new Promise<number>(r => server.listen(0, '127.0.0.1', () => r((server.address() as AddressInfo).port)))
afterAll(() => new Promise(r => server.close(r)))

function get(path: string, encoding?: string) {
  return ready.then(port => new Promise<{ enc?: string; body: Buffer }>((resolve, reject) => {
    http.get({ port, host: '127.0.0.1', path, headers: encoding ? { 'Accept-Encoding': encoding } : {} }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ enc: res.headers['content-encoding'], body: Buffer.concat(chunks) }))
    }).on('error', reject)
  }))
}

describe('compressJson', () => {
  it('gzips JSON when the client accepts gzip', async () => {
    const r = await get('/', 'gzip')
    expect(r.enc).toBe('gzip')
    expect(r.body.length).toBeLessThan(big.length / 5)
    expect(zlib.gunzipSync(r.body).toString()).toBe(big)
  })

  it('uses brotli when the client prefers it', async () => {
    const r = await get('/', 'br, gzip')
    expect(r.enc).toBe('br')
    expect(zlib.brotliDecompressSync(r.body).toString()).toBe(big)
  })

  it('sends plain JSON to clients that ask for no compression', async () => {
    const r = await get('/')
    expect(r.enc).toBeUndefined()
    expect(r.body.toString()).toBe(big)
  })

  it('leaves small answers and event streams alone', async () => {
    expect((await get('/small', 'gzip')).enc).toBeUndefined()
    expect((await get('/sse', 'gzip')).enc).toBeUndefined()
  })
})

import { describe, it, expect, vi, afterAll } from 'vitest'
import http from 'http'
import type { AddressInfo } from 'net'
import { weakEtag, etagMatches, etagJson } from '@/lib/etag'
import { compressJson } from '@/lib/json-compression.mjs'

const getActivity = vi.fn().mockResolvedValue({ alice: { status: 'idle' } })
vi.mock('@/services/sessions-service', () => ({ getActivity }))
vi.mock('@/services/status-snapshots-service', () => ({ getSnapshots: () => ({}) }))
const { GET } = await import('@/app/api/sessions/activity/route')

describe('etag helper', () => {
  it('tags the same body the same way, and a different body differently', () => {
    expect(weakEtag('{"a":1}')).toBe(weakEtag('{"a":1}'))
    expect(weakEtag('{"a":1}')).not.toBe(weakEtag('{"a":2}'))
    expect(weakEtag('x')).toMatch(/^W\/"[\w-]+"$/)
  })

  it('matches weakly, in a list, and on *', () => {
    const tag = weakEtag('x')
    expect(etagMatches(tag, tag)).toBe(true)
    expect(etagMatches(tag.slice(2), tag)).toBe(true)
    expect(etagMatches(`W/"other", ${tag}`, tag)).toBe(true)
    expect(etagMatches('*', tag)).toBe(true)
    expect(etagMatches('W/"other"', tag)).toBe(false)
    expect(etagMatches(null, tag)).toBe(false)
  })

  it('answers 304 with no body when the client has it, 200 with the body otherwise', () => {
    const first = etagJson(null, { a: 1 })
    expect(first).toMatchObject({ status: 200, body: '{"a":1}' })
    expect(first.headers['Cache-Control']).toBe('no-cache')
    expect(etagJson(first.headers.ETag, { a: 1 })).toMatchObject({ status: 304, body: null })
    expect(etagJson(first.headers.ETag, { a: 2 }).status).toBe(200)
  })
})

describe('GET /api/sessions/activity with If-None-Match', () => {
  it('sends an ETag, then 304 for the same answer, then 200 when it changes', async () => {
    const first = await GET(new Request('http://x/api/sessions/activity'))
    const tag = first.headers.get('etag')!
    expect(first.status).toBe(200)
    expect(tag).toMatch(/^W\//)
    expect((await first.json()).activity.alice.status).toBe('idle')

    const again = await GET(new Request('http://x/api/sessions/activity', { headers: { 'If-None-Match': tag } }))
    expect(again.status).toBe(304)
    expect(await again.text()).toBe('')

    getActivity.mockResolvedValueOnce({ alice: { status: 'working' } })
    const changed = await GET(new Request('http://x/api/sessions/activity', { headers: { 'If-None-Match': tag } }))
    expect(changed.status).toBe(200)
    expect(changed.headers.get('etag')).not.toBe(tag)
  })
})

// The headless router and server.mjs write through compressJson: a 304 must stay empty there
describe('304 behind compressJson', () => {
  const data = { agents: Array.from({ length: 300 }, (_, i) => ({ id: i })) }
  const server = http.createServer((req, res) => {
    compressJson(req, res)
    const r = etagJson(req.headers['if-none-match'], data)
    res.writeHead(r.status, r.headers)
    res.end(r.body ?? undefined)
  })
  const ready = new Promise<number>(r => server.listen(0, '127.0.0.1', () => r((server.address() as AddressInfo).port)))
  afterAll(() => new Promise(r => server.close(r)))

  const get = (headers: Record<string, string>) => ready.then(port => new Promise<{ status: number; enc?: string; etag?: string; size: number }>((resolve, reject) => {
    http.get({ port, host: '127.0.0.1', path: '/', headers: { 'Accept-Encoding': 'gzip', ...headers } }, res => {
      let size = 0
      res.on('data', c => { size += c.length })
      res.on('end', () => resolve({ status: res.statusCode!, enc: res.headers['content-encoding'], etag: res.headers.etag, size }))
    }).on('error', reject)
  }))

  it('gzips the 200 and sends an empty 304', async () => {
    const first = await get({})
    expect(first).toMatchObject({ status: 200, enc: 'gzip' })
    const again = await get({ 'If-None-Match': first.etag! })
    expect(again).toMatchObject({ status: 304, size: 0, enc: undefined })
  })
})

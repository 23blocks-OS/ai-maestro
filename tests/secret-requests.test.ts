import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createRequest, listRequests, getRequest, removeRequest, cleanNote, resetSecretRequests, REQUEST_TTL_MS } from '@/lib/secret-requests'

beforeEach(() => resetSecretRequests())
afterEach(() => vi.useRealTimers())

describe('secret request store', () => {
  it('holds a name, an id and a note, never a value', () => {
    const r = createRequest('agent-1', 'OPENAI_API_KEY', 'for the embedding job')
    expect(Object.keys(r).sort()).toEqual(['agentId', 'createdAt', 'id', 'name', 'note'])
    expect(getRequest(r.id)?.name).toBe('OPENAI_API_KEY')
  })

  it('returns the same request for the same agent and name', () => {
    const a = createRequest('agent-1', 'OPENAI_API_KEY')
    const b = createRequest('agent-1', 'OPENAI_API_KEY')
    expect(b.id).toBe(a.id)
    expect(listRequests('agent-1').length).toBe(1)
  })

  it('keeps agents apart', () => {
    createRequest('agent-1', 'A_KEY')
    createRequest('agent-2', 'B_KEY')
    expect(listRequests('agent-1').map((r) => r.name)).toEqual(['A_KEY'])
    expect(listRequests('agent-2').map((r) => r.name)).toEqual(['B_KEY'])
  })

  it('forgets a request once removed', () => {
    const r = createRequest('agent-1', 'A_KEY')
    removeRequest(r.id)
    expect(getRequest(r.id)).toBeUndefined()
    expect(listRequests('agent-1')).toEqual([])
  })

  it('expires after the time limit', () => {
    vi.useFakeTimers()
    const r = createRequest('agent-1', 'A_KEY')
    vi.advanceTimersByTime(REQUEST_TTL_MS + 1000)
    expect(getRequest(r.id)).toBeUndefined()
  })

  it('caps how many one agent can have open', () => {
    for (let i = 0; i < 40; i++) createRequest('agent-1', `KEY_${i}`)
    expect(listRequests('agent-1').length).toBeLessThanOrEqual(20)
  })

  it('cleans the note to one short line of text', () => {
    expect(cleanNote('line1\nline2\u0000\t<script>')).toBe('line1 line2 <script>')
    expect(cleanNote('x'.repeat(500))?.length).toBe(200)
    expect(cleanNote(42)).toBeUndefined()
    expect(cleanNote('   ')).toBeUndefined()
  })
})

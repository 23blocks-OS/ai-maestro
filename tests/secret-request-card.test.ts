import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SecretRequestCard from '@/components/chat/SecretRequestCard'
import { answerSecretRequestApi } from '@/lib/secret-request-api'

const VALUE = 'sk-live-Q1w2e3r4-do-not-leak'
const request = { id: '11111111-2222-3333-4444-555555555555', name: 'OPENAI_API_KEY', note: 'for the embedding job', createdAt: 1 }

describe('the card', () => {
  const html = renderToStaticMarkup(createElement(SecretRequestCard, { agentId: 'agent-1', request, onDone: () => {} }))

  it('asks for the value in a masked field the browser will not fill, save or autocorrect', () => {
    expect(html).toMatch(/type="password"/)
    expect(html).toMatch(/autoComplete="new-password"|autocomplete="new-password"/i)
    expect(html).toMatch(/spellCheck="false"|spellcheck="false"/i)
  })

  it('shows the name the agent asked for, already filled in, and the reason', () => {
    expect(html).toContain('value="OPENAI_API_KEY"')
    expect(html).toContain('for the embedding job')
  })

  it('starts with nothing in the value field and the store button off', () => {
    const passwordInput = html.match(/<input[^>]*type="password"[^>]*>/)?.[0] ?? ''
    expect(passwordInput).not.toMatch(/\svalue="[^"]+"/)   // empty, not pre-filled
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Store it<\/button>/)
  })

  it('tells the user the value is not sent to the chat or the model', () => {
    expect(html).toContain('not sent to the chat or the model')
  })
})

describe('answering from the browser', () => {
  it('posts the value once to the dedicated endpoint, as JSON, with no caching', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ stored: true, name: 'OPENAI_API_KEY' }) })) as any
    const r = await answerSecretRequestApi('agent-1', request.id, { value: VALUE, name: 'OPENAI_API_KEY' }, f)
    expect(r).toEqual({ ok: true, name: 'OPENAI_API_KEY', declined: false })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe(`/api/agents/agent-1/secret-requests/${request.id}`)
    expect(init.method).toBe('POST')
    expect(init.cache).toBe('no-store')
    expect(JSON.parse(init.body)).toEqual({ value: VALUE, name: 'OPENAI_API_KEY' })
    expect(url).not.toContain(VALUE)   // never in a URL
  })

  it('never returns or throws the value, even when the server fails', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ message: 'Could not store it: the keyring did not answer' }) })) as any
    const r = await answerSecretRequestApi('agent-1', request.id, { value: VALUE }, f)
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain(VALUE)
  })

  it('reports an unreachable server in plain words', async () => {
    const f = vi.fn(async () => { throw new Error(`boom ${VALUE}`) }) as any
    const r = await answerSecretRequestApi('agent-1', request.id, { value: VALUE }, f)
    expect(r).toEqual({ ok: false, message: 'Could not reach AI Maestro.' })
    expect(JSON.stringify(r)).not.toContain(VALUE)
  })

  it('declining sends no value', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ declined: true, name: 'OPENAI_API_KEY' }) })) as any
    const r = await answerSecretRequestApi('agent-1', request.id, { decline: true }, f)
    expect(r.declined).toBe(true)
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ decline: true })
  })
})

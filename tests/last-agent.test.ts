/** B028: a refresh or a return must reopen the agent this browser had open, never a different one. */
import { describe, it, expect, beforeEach } from 'vitest'
import { autoPickAgent, loadLastAgent, saveLastAgent, LAST_AGENT_KEY } from '@/lib/last-agent'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  }
})

describe('last agent', () => {
  it('remembers the open agent and ignores "none"', () => {
    saveLastAgent('a1')
    saveLastAgent(null)
    expect(loadLastAgent()).toBe('a1')
    expect(store.get(LAST_AGENT_KEY)).toBe('a1')
  })

  it('survives a browser that refuses storage', () => {
    ;(globalThis as any).localStorage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(loadLastAgent()).toBeNull()
    expect(() => saveLastAgent('a1')).not.toThrow()
  })
})

describe('autoPickAgent', () => {
  it('picks the first online agent only on a browser that never had one open', () => {
    expect(autoPickAgent(null, null, 'first')).toBe('first')
  })

  it('never replaces the open agent', () => {
    expect(autoPickAgent('mine', null, 'first')).toBeNull()
  })

  it('never picks silently when this browser had an agent, even one that is gone', () => {
    expect(autoPickAgent(null, 'deleted-agent', 'first')).toBeNull()
  })

  it('picks nothing when no agent is online', () => {
    expect(autoPickAgent(null, null, undefined)).toBeNull()
  })
})

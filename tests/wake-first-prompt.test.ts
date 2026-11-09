/**
 * B040: a new agent woke blank. Its first launch gets its task as the first prompt, once, and never when an
 * on-wake hook is set, the program did not start, or the task is only the default "Agent for <name>".
 */
import { describe, it, expect } from 'vitest'
import { firstPromptFor } from '@/services/agents-core-service'

const agent = { name: 'web-site', launchCount: 0, taskDescription: 'Build the website.' }

describe('firstPromptFor', () => {
  it('a first launch gets the task', () => {
    expect(firstPromptFor(agent, true)).toBe('Build the website.')
    expect(firstPromptFor({ ...agent, launchCount: undefined }, true)).toBe('Build the website.')
  })
  it('never on a later launch, so a restart does not repeat the first task', () => {
    expect(firstPromptFor({ ...agent, launchCount: 1 }, true)).toBeNull()
  })
  it('an on-wake hook wins', () => {
    expect(firstPromptFor({ ...agent, hooks: { 'on-wake': 'prompt:hi' } }, true)).toBeNull()
  })
  it('nothing when the program did not start, or there is no real task', () => {
    expect(firstPromptFor(agent, false)).toBeNull()
    expect(firstPromptFor({ ...agent, taskDescription: 'Agent for web-site' }, true)).toBeNull()
    expect(firstPromptFor({ ...agent, taskDescription: '  ' }, true)).toBeNull()
  })
})

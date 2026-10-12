import { describe, it, expect } from 'vitest'
import { buildWakeBody } from '@/lib/wake-request'

describe('the wake request body (F040)', () => {
  it('SENDS "supervised": the server falls back to the mode stored on the agent when none is sent', () => {
    // The old handlers dropped "supervised", so choosing it for an agent stored as Full autonomy started
    // that agent with no questions asked.
    expect(buildWakeBody('claude', { permissionMode: 'supervised' }, undefined)).toEqual({ program: 'claude', permissionMode: 'supervised' })
  })

  it('sends every other valid mode as chosen', () => {
    for (const mode of ['planOnly', 'trustEdits', 'smartAuto', 'fullAutonomy']) {
      expect(buildWakeBody('claude', { permissionMode: mode }).permissionMode).toBe(mode)
    }
  })

  it('drops a mode that is not one of the five', () => {
    expect(buildWakeBody('claude', { permissionMode: 'bypassPermissions' })).toEqual({ program: 'claude' })
    expect(buildWakeBody('claude', { permissionMode: '' })).toEqual({ program: 'claude' })
  })

  it('sends no program when the dialog says keep the agent\'s own', () => {
    expect(buildWakeBody('', { permissionMode: 'supervised' })).toEqual({ permissionMode: 'supervised' })
    expect(buildWakeBody(undefined, undefined)).toEqual({})
    expect(buildWakeBody('   ', undefined)).toEqual({})
  })

  it('sends the host for a remote agent, and remember only when it is true', () => {
    expect(buildWakeBody('grok', { remember: true }, 'http://100.80.12.6:23000')).toEqual({ program: 'grok', hostUrl: 'http://100.80.12.6:23000', remember: true })
    expect(buildWakeBody('grok', { remember: false })).toEqual({ program: 'grok' })
  })

  it('never carries the execution mode to the server (the screen uses it for the streaming tab)', () => {
    expect(buildWakeBody('claude', { execMode: 'streaming' })).toEqual({ program: 'claude' })
  })
})

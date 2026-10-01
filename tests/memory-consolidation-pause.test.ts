/**
 * Fleet-wide pause for memory consolidation (the paid part of memory).
 */

import { describe, it, expect, vi, afterAll, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// The settings module resolves its path at load time, so HOME must exist before the mock runs
const { HOME } = vi.hoisted(() => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const os = require('os') as typeof import('os')
  return { HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'memory-pause-')) }
})
vi.mock('os', async (orig) => {
  const real = await orig<typeof import('os')>()
  return { ...real, default: { ...real, homedir: () => HOME }, homedir: () => HOME }
})

import { isConsolidationPaused, setConsolidationPaused, loadClassifierSettings } from '@/lib/memory/settings'

const FILE = path.join(HOME, '.aimaestro', 'memory-settings.json')

afterEach(() => { delete process.env.MEMORY_CONSOLIDATION_PAUSED; fs.rmSync(FILE, { force: true }) })
afterAll(() => fs.rmSync(HOME, { recursive: true, force: true }))

describe('consolidation pause', () => {
  it('is not paused by default', () => {
    expect(isConsolidationPaused()).toBe(false)
  })

  it('pauses and resumes through the settings file, keeping the classifier settings', () => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify({ classifier: { apiKey: 'k', model: 'jev-latest' } }))
    setConsolidationPaused(true)
    expect(isConsolidationPaused()).toBe(true)
    expect(loadClassifierSettings().apiKey).toBe('k')
    expect(fs.statSync(FILE).mode & 0o777).toBe(0o600)
    setConsolidationPaused(false)
    expect(isConsolidationPaused()).toBe(false)
  })

  it('can be forced by the environment', () => {
    process.env.MEMORY_CONSOLIDATION_PAUSED = 'true'
    expect(isConsolidationPaused()).toBe(true)
  })
})

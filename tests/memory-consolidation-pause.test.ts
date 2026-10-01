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

import {
  isConsolidationPaused, setConsolidationPaused, loadClassifierSettings, loadConsolidationSettings,
  saveConsolidationSettings, inConsolidationWindow, consolidationWindowHours, nextConsolidationWindow,
  DEFAULT_CONSOLIDATION_SETTINGS,
} from '@/lib/memory/settings'

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

describe('consolidation schedule and limits', () => {
  const at = (h: number) => new Date(2026, 9, 1, h, 30)

  it('defaults to the 2-8 AM window and the old per-run limits', () => {
    expect(loadConsolidationSettings()).toEqual(DEFAULT_CONSOLIDATION_SETTINGS)
    expect(consolidationWindowHours()).toBe(6)
  })

  it('a window may wrap past midnight', () => {
    const w = { startHour: 22, endHour: 3 }
    expect(consolidationWindowHours(w)).toBe(5)
    expect(inConsolidationWindow(at(21), w)).toBe(false)
    expect(inConsolidationWindow(at(23), w)).toBe(true)
    expect(inConsolidationWindow(at(2), w)).toBe(true)
    expect(inConsolidationWindow(at(3), w)).toBe(false)
  })

  it('the next window is today if it has not started, tomorrow if it has closed', () => {
    const w = { startHour: 2, endHour: 8 }
    expect(nextConsolidationWindow(at(1), w).getHours()).toBe(2)
    expect(nextConsolidationWindow(at(1), w).getDate()).toBe(1)
    expect(nextConsolidationWindow(at(9), w).getDate()).toBe(2)
    expect(nextConsolidationWindow(at(3), w)).toEqual(at(3))
  })

  it('saves valid values and ignores invalid ones', () => {
    const s = saveConsolidationSettings({ startHour: 23, endHour: 25 as any, maxPassagesPerRun: 10, maxSummaryCallsPerRun: 0, backlog: false })
    expect(s.startHour).toBe(23)
    expect(s.endHour).toBe(8)
    expect(s.maxPassagesPerRun).toBe(1000)
    expect(s.maxSummaryCallsPerRun).toBe(0)
    expect(s.backlog).toBe(false)
  })

  it('the environment pause is never written to the file', () => {
    process.env.MEMORY_CONSOLIDATION_PAUSED = 'true'
    expect(saveConsolidationSettings({ startHour: 1 }).paused).toBe(true)
    delete process.env.MEMORY_CONSOLIDATION_PAUSED
    expect(loadConsolidationSettings().paused).toBe(false)
  })
})

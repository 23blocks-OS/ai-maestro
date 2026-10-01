/**
 * Memory classifier settings (host-level, per user)
 *
 * Every AI Maestro user brings their own classifier key and URL. Nothing is
 * shipped with the app. Stored at ~/.aimaestro/memory-settings.json with 0600
 * permissions; the API key is never returned unmasked by any endpoint.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

export interface ClassifierSettings {
  provider: 'jev'
  /** Base URL of a Jev-compatible System One API (POST {url}/v1/systemone) */
  url: string
  model: string
  apiKey: string
  /** Minimum P(durable) for a passage to become a memory */
  minDurable: number
  /** Minimum importance score (0-4 rubric) */
  minImportance: number
}

export const DEFAULT_CLASSIFIER_SETTINGS: ClassifierSettings = {
  provider: 'jev',
  url: 'https://api.typesafe.ai',
  model: 'jev-latest',
  apiKey: '',
  minDurable: 0.75,
  minImportance: 2.5,
}

/** Resolved on use, not at import: modules that import this load before HOME is final in tests */
const settingsFile = () => path.join(os.homedir(), '.aimaestro', 'memory-settings.json')

export function loadClassifierSettings(): ClassifierSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))
    return { ...DEFAULT_CLASSIFIER_SETTINGS, ...(raw?.classifier || {}) }
  } catch {
    return { ...DEFAULT_CLASSIFIER_SETTINGS }
  }
}

/**
 * When and how much consolidation runs on this host: the part of memory that
 * spends money (Jev classification on your key, and the summarizer on your
 * Claude subscription). Indexing, search and recall are local and are not
 * governed by these settings.
 *
 * Stored under `consolidation` in memory-settings.json. Every path reads it:
 * each agent's nightly timer and schedule (start hour), the sweep and the
 * history backlog (the window), and each run (the limits). Every consolidation
 * goes through triggerConsolidation (services/agents-memory-service.ts), which
 * refuses while paused. MEMORY_CONSOLIDATION_PAUSED=true forces a pause.
 */
export interface ConsolidationSettings {
  /** No consolidation starts while paused; a run already going finishes */
  paused: boolean
  /** The night window, local hours. It may wrap past midnight (22 → 6). */
  startHour: number
  endHour: number
  /** Keep consolidating older history, agent after agent, until the window closes */
  backlog: boolean
  /** Agents the night sweep visits per pass (every 15 minutes) */
  agentsPerSweep: number
  /** Per-run cap on classifier calls (passages); the next run picks up where this stopped */
  maxPassagesPerRun: number
  /** Per-run cap on summarizer calls (Claude, one per ~60k chars of a session) */
  maxSummaryCallsPerRun: number
}

export const DEFAULT_CONSOLIDATION_SETTINGS: ConsolidationSettings = {
  paused: false,
  startHour: 2,
  endHour: 8,
  backlog: true,
  agentsPerSweep: 20,
  maxPassagesPerRun: 1000,
  maxSummaryCallsPerRun: 10,
}

function readSettingsFile(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}
  } catch {
    return {}
  }
}

function writeSettingsFile(data: Record<string, any>): void {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.chmodSync(settingsFile(), 0o600)
}

const isHour = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23
const inRange = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

/** The stored settings, without the environment override */
function storedConsolidationSettings(): ConsolidationSettings {
  const raw = readSettingsFile().consolidation || {}
  const d = DEFAULT_CONSOLIDATION_SETTINGS
  return {
    paused: raw.paused === true,
    startHour: isHour(raw.startHour) ? raw.startHour : d.startHour,
    endHour: isHour(raw.endHour) ? raw.endHour : d.endHour,
    backlog: raw.backlog !== false,
    agentsPerSweep: inRange(raw.agentsPerSweep, 1, 200) ? raw.agentsPerSweep : d.agentsPerSweep,
    maxPassagesPerRun: inRange(raw.maxPassagesPerRun, 50, 10000) ? raw.maxPassagesPerRun : d.maxPassagesPerRun,
    maxSummaryCallsPerRun: inRange(raw.maxSummaryCallsPerRun, 0, 50) ? raw.maxSummaryCallsPerRun : d.maxSummaryCallsPerRun,
  }
}

export function loadConsolidationSettings(): ConsolidationSettings {
  const s = storedConsolidationSettings()
  if (process.env.MEMORY_CONSOLIDATION_PAUSED === 'true') s.paused = true
  return s
}

/** Save the valid fields of `update`; invalid ones are ignored. Returns the effective settings. */
export function saveConsolidationSettings(update: Partial<ConsolidationSettings>): ConsolidationSettings {
  const next = storedConsolidationSettings()
  if (typeof update.paused === 'boolean') next.paused = update.paused
  if (isHour(update.startHour)) next.startHour = update.startHour
  if (isHour(update.endHour)) next.endHour = update.endHour
  if (typeof update.backlog === 'boolean') next.backlog = update.backlog
  if (inRange(update.agentsPerSweep, 1, 200)) next.agentsPerSweep = update.agentsPerSweep
  if (inRange(update.maxPassagesPerRun, 50, 10000)) next.maxPassagesPerRun = update.maxPassagesPerRun
  if (inRange(update.maxSummaryCallsPerRun, 0, 50)) next.maxSummaryCallsPerRun = update.maxSummaryCallsPerRun
  const file = readSettingsFile()
  file.consolidation = next
  writeSettingsFile(file)
  return loadConsolidationSettings()
}

/** Length of the window in hours (1–24). Equal start and end means all day. */
export function consolidationWindowHours(s: Pick<ConsolidationSettings, 'startHour' | 'endHour'> = loadConsolidationSettings()): number {
  return ((s.endHour - s.startHour + 24) % 24) || 24
}

export function inConsolidationWindow(now: Date = new Date(), s: Pick<ConsolidationSettings, 'startHour' | 'endHour'> = loadConsolidationSettings()): boolean {
  const sinceStart = (now.getHours() - s.startHour + 24) % 24
  return sinceStart < consolidationWindowHours(s)
}

/** When the window next opens (now, if it is open) */
export function nextConsolidationWindow(now: Date = new Date(), s: Pick<ConsolidationSettings, 'startHour' | 'endHour'> = loadConsolidationSettings()): Date {
  if (inConsolidationWindow(now, s)) return now
  const next = new Date(now)
  next.setHours(s.startHour, 0, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next
}

export function isConsolidationPaused(): boolean {
  return loadConsolidationSettings().paused
}

export function setConsolidationPaused(paused: boolean): void {
  saveConsolidationSettings({ paused })
}

export function isClassifierConfigured(s: ClassifierSettings = loadClassifierSettings()): boolean {
  return Boolean(s.apiKey && s.url && s.model)
}

/**
 * Merge an update into the stored settings. An empty or missing apiKey in the
 * update keeps the stored key, so the UI can save other fields without ever
 * having seen the key.
 */
export function saveClassifierSettings(update: Partial<ClassifierSettings>): ClassifierSettings {
  const current = loadClassifierSettings()
  const next: ClassifierSettings = { ...current }

  if (typeof update.url === 'string' && update.url.trim()) next.url = update.url.trim().replace(/\/+$/, '')
  if (typeof update.model === 'string' && update.model.trim()) next.model = update.model.trim()
  if (typeof update.apiKey === 'string' && update.apiKey.trim()) next.apiKey = update.apiKey.trim()
  if (typeof update.minDurable === 'number' && update.minDurable >= 0 && update.minDurable <= 1) next.minDurable = update.minDurable
  if (typeof update.minImportance === 'number' && update.minImportance >= 0 && update.minImportance <= 4) next.minImportance = update.minImportance

  let fileData: Record<string, unknown> = {}
  try { fileData = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) } catch { /* new file */ }
  fileData.classifier = next

  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(fileData, null, 2), { mode: 0o600 })
  fs.chmodSync(settingsFile(), 0o600)
  return next
}

export function clearClassifierKey(): ClassifierSettings {
  const current = loadClassifierSettings()
  let fileData: Record<string, unknown> = {}
  try { fileData = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) } catch { /* new file */ }
  fileData.classifier = { ...current, apiKey: '' }
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(fileData, null, 2), { mode: 0o600 })
  return { ...current, apiKey: '' }
}

/** Settings safe to send to a browser: the key is reduced to its last 4 chars. */
export function maskClassifierSettings(s: ClassifierSettings) {
  const { apiKey, ...rest } = s
  return {
    ...rest,
    configured: isClassifierConfigured(s),
    apiKeyHint: apiKey ? `…${apiKey.slice(-4)}` : null,
  }
}

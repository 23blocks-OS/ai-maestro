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
  minDurable: 0.85,
  minImportance: 3,
}

const SETTINGS_FILE = path.join(os.homedir(), '.aimaestro', 'memory-settings.json')

export function loadClassifierSettings(): ClassifierSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    return { ...DEFAULT_CLASSIFIER_SETTINGS, ...(raw?.classifier || {}) }
  } catch {
    return { ...DEFAULT_CLASSIFIER_SETTINGS }
  }
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
  try { fileData = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) } catch { /* new file */ }
  fileData.classifier = next

  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(fileData, null, 2), { mode: 0o600 })
  fs.chmodSync(SETTINGS_FILE, 0o600)
  return next
}

export function clearClassifierKey(): ClassifierSettings {
  const current = loadClassifierSettings()
  let fileData: Record<string, unknown> = {}
  try { fileData = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) } catch { /* new file */ }
  fileData.classifier = { ...current, apiKey: '' }
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(fileData, null, 2), { mode: 0o600 })
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

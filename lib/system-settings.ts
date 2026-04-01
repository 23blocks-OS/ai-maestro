/**
 * System Settings — persistent server-side configuration
 *
 * Storage: ~/.aimaestro/system-settings.json
 * Read on every access (no caching) so changes take effect immediately.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const SETTINGS_FILE = path.join(AIMAESTRO_DIR, 'system-settings.json')

export interface SystemSettings {
  /** When false, the conversation indexer (Delta Index / maintainMemory) is completely disabled */
  conversationIndexerEnabled: boolean
}

const DEFAULTS: SystemSettings = {
  conversationIndexerEnabled: true,
}

function ensureDir() {
  if (!fs.existsSync(AIMAESTRO_DIR)) {
    fs.mkdirSync(AIMAESTRO_DIR, { recursive: true })
  }
}

/** Read current settings (merges with defaults for forward-compatibility) */
export function getSystemSettings(): SystemSettings {
  // Ensure the directory exists before any file operations so that
  // getSystemSettings() is safe to call before updateSystemSettings() ever runs.
  ensureDir()
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8')
      const stored = JSON.parse(raw)
      return { ...DEFAULTS, ...stored }
    }
  } catch (err) {
    console.error('[SystemSettings] Failed to read settings:', err)
  }
  return { ...DEFAULTS }
}

/** Write settings (partial update — merges with existing) */
export function updateSystemSettings(patch: Partial<SystemSettings>): SystemSettings {
  ensureDir()
  const current = getSystemSettings()
  const updated = { ...current, ...patch }
  // Atomic write: write to tmp then rename to avoid partial reads
  const tmpPath = SETTINGS_FILE + '.tmp.' + process.pid
  fs.writeFileSync(tmpPath, JSON.stringify(updated, null, 2), 'utf-8')
  fs.renameSync(tmpPath, SETTINGS_FILE)
  return updated
}

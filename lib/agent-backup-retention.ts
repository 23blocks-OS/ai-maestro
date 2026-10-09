/**
 * Retention for ~/.aimaestro/backups/agents/ (B014 item 2).
 *
 * Every permanent agent delete copies the whole agent folder (agent.db included)
 * to `<id>-<ISO timestamp>/`. Nothing pruned them. Policy, applied right after a
 * new backup is written and never at startup:
 *   1. always keep the newest N backups (default 5, AIM_BACKUP_KEEP; "all" disables pruning);
 *   2. beyond those, remove backups older than D days (default 30, AIM_BACKUP_MAX_AGE_DAYS).
 *
 * Only direct children that are real directories and match the name this code
 * creates are ever touched. Symlinks, files and unrecognised names are skipped.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

export const DEFAULT_BACKUP_KEEP = 5
export const DEFAULT_BACKUP_MAX_AGE_DAYS = 30

// `${agent.id}-${new Date().toISOString().replace(/[:.]/g, '-')}`
const BACKUP_NAME = /^([A-Za-z0-9][A-Za-z0-9._-]*?)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/

export function agentBackupsDir(): string {
  return path.join(os.homedir(), '.aimaestro', 'backups', 'agents')
}

/** Parse the timestamp out of a backup folder name; null when the name is not ours. */
export function parseBackupName(name: string): number | null {
  const m = BACKUP_NAME.exec(name)
  if (!m) return null
  const iso = m[2].replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/, '$1:$2:$3.$4')
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

export interface PruneOptions {
  dryRun?: boolean
  now?: number
  dir?: string
}
export interface PruneResult {
  dryRun: boolean
  disabled: boolean
  kept: string[]
  removed: string[]
  failed: string[]
}

function readKeep(): number | 'all' {
  const raw = process.env.AIM_BACKUP_KEEP?.trim().toLowerCase()
  if (raw === 'all') return 'all'
  const n = raw === undefined || raw === '' ? NaN : Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_BACKUP_KEEP
}
function readMaxAgeDays(): number {
  const raw = process.env.AIM_BACKUP_MAX_AGE_DAYS?.trim()
  const n = raw === undefined || raw === '' ? NaN : Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BACKUP_MAX_AGE_DAYS
}

/** Never throws. With dryRun, nothing is deleted and `removed` lists what would be. */
export function pruneAgentBackups(opts: PruneOptions = {}): PruneResult {
  const dryRun = !!opts.dryRun
  const result: PruneResult = { dryRun, disabled: false, kept: [], removed: [], failed: [] }
  try {
    const keep = readKeep()
    if (keep === 'all') {
      result.disabled = true
      return result
    }
    const maxAgeMs = readMaxAgeDays() * 86_400_000
    const now = opts.now ?? Date.now()
    const dir = opts.dir ?? agentBackupsDir()

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return result // no backups directory yet
    }

    const backups: { name: string; time: number }[] = []
    for (const e of entries) {
      if (!e.isDirectory()) continue // a Dirent from readdir never follows links: symlinks are not directories here
      const time = parseBackupName(e.name)
      if (time === null) continue
      backups.push({ name: e.name, time })
    }
    backups.sort((a, b) => b.time - a.time || (a.name < b.name ? 1 : -1)) // newest first

    backups.forEach((b, i) => {
      if (i < keep || now - b.time <= maxAgeMs) {
        result.kept.push(b.name)
        return
      }
      if (dryRun) {
        result.removed.push(b.name)
        return
      }
      try {
        fs.rmSync(path.join(dir, b.name), { recursive: true, force: true })
        result.removed.push(b.name)
        console.log(`[Agent Registry] Pruned old agent backup ${b.name}`)
      } catch (err) {
        result.failed.push(b.name)
        console.warn(`[Agent Registry] Could not prune agent backup ${b.name}:`, err)
      }
    })
  } catch (err) {
    console.warn('[Agent Registry] Backup pruning skipped:', err)
  }
  return result
}

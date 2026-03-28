/**
 * Transactional Config Undo/Redo System
 *
 * Stores file-level snapshots in SQLite (~/.aimaestro/config-undo.db) before
 * every destructive UI operation. Each transaction row captures the BEFORE state
 * of all affected config files + element folders. Undo restores the BEFORE state;
 * redo restores the CURRENT state that was saved during undo.
 *
 * Max 10 undo levels, 10 redo levels. Element folders (plugins, skills) are
 * stored as tar.gz BLOBs. Config files (JSON) are stored as gzipped BLOBs.
 */

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'
import { execSync } from 'child_process'
import archiver from 'archiver'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const DB_PATH = path.join(AIMAESTRO_DIR, 'config-undo.db')
const MAX_ROWS = 10

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Column name keys for config file pairs */
export type ConfigColumn =
  | 'settings_json'
  | 'settings_local'
  | 'mcp_json'
  | 'registry_json'
  | 'teams_json'
  | 'hosts_json'
  | 'claude_md'
  | 'skill_settings_json'
  | 'governance_json'

/** Manifest entry describing one element artifact */
export interface ManifestEntry {
  type: 'cache_dir' | 'skill_dir' | 'script' | 'rule_file' | 'command_file'
       | 'agent_file' | 'output_style' | 'plugin'
  /** Absolute path on disk (null for non-file entries like hook_entry) */
  path: string | null
  /** Path within the tar.gz archive */
  tar_member: string
  /** Whether this artifact existed BEFORE the operation */
  existed_before: boolean
  /** Additional fields for plugin-type entries (marketplace removal) */
  name?: string
  cache_dir?: string
  scripts?: string[]
  settings_key?: string
  was_enabled?: boolean
}

/** Options for creating a new transaction */
export interface TransactionOptions {
  description: string
  operation: string
  scope: 'global' | 'local'
  agentId?: string
  /** Config file paths to snapshot — key = column name, value = absolute file path */
  configFiles?: Partial<Record<ConfigColumn, string>>
  /** Element entries to archive into element_blob */
  elements?: Array<{ fsPath: string; archiveMember: string }>
  /** Manifest documenting every artifact path for undo restoration */
  elementManifest?: ManifestEntry[]
}

// ---------------------------------------------------------------------------
// All config columns for iteration
// ---------------------------------------------------------------------------

const CONFIG_COLUMNS: ConfigColumn[] = [
  'settings_json', 'settings_local', 'mcp_json',
  'registry_json', 'teams_json', 'hosts_json', 'claude_md',
  'skill_settings_json', 'governance_json',
]

// ---------------------------------------------------------------------------
// Database singleton
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null

function getDb(): Database.Database {
  if (_db) return _db
  fs.mkdirSync(AIMAESTRO_DIR, { recursive: true })
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('synchronous = NORMAL')
  initSchema(_db)
  return _db
}

function initSchema(db: Database.Database): void {
  // Build column definitions for config file pairs
  const configCols = CONFIG_COLUMNS.map(col =>
    `${col}_path TEXT,\n  ${col}_blob BLOB`
  ).join(',\n  ')

  const createTable = (name: string) => `
    CREATE TABLE IF NOT EXISTS ${name} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT NOT NULL,
      operation TEXT NOT NULL,
      scope TEXT NOT NULL,
      agent_id TEXT,
      ${configCols},
      element_blob BLOB,
      element_existed INTEGER DEFAULT 1,
      element_manifest TEXT NOT NULL DEFAULT '[]'
    )
  `

  db.exec(createTable('transactions'))
  db.exec(createTable('redo_transactions'))

  // Enforce max rows via triggers
  const hasTrigger = (name: string) =>
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name)

  if (!hasTrigger('limit_transactions')) {
    db.exec(`
      CREATE TRIGGER limit_transactions AFTER INSERT ON transactions
      BEGIN
        DELETE FROM transactions WHERE id IN (
          SELECT id FROM transactions ORDER BY id ASC
          LIMIT MAX(0, (SELECT COUNT(*) FROM transactions) - ${MAX_ROWS})
        );
      END
    `)
  }
  if (!hasTrigger('limit_redo')) {
    db.exec(`
      CREATE TRIGGER limit_redo AFTER INSERT ON redo_transactions
      BEGIN
        DELETE FROM redo_transactions WHERE id IN (
          SELECT id FROM redo_transactions ORDER BY id ASC
          LIMIT MAX(0, (SELECT COUNT(*) FROM redo_transactions) - ${MAX_ROWS})
        );
      END
    `)
  }
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

/** Read a file and gzip its contents. Returns null if file doesn't exist. */
function snapshotFile(filePath: string): Buffer | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const content = fs.readFileSync(filePath)
    return zlib.gzipSync(content)
  } catch {
    return null
  }
}

/** Restore a gzipped file snapshot to disk. */
function restoreFile(filePath: string, blob: Buffer): void {
  const content = zlib.gunzipSync(blob)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

/**
 * Create a tar.gz archive of one or more directories/files.
 * Returns the tar.gz as a Buffer, or null if nothing to archive.
 */
async function snapshotPaths(
  entries: Array<{ fsPath: string; archiveMember: string }>
): Promise<Buffer | null> {
  const existing = entries.filter(e => fs.existsSync(e.fsPath))
  if (existing.length === 0) return null

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } })
    archive.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)

    for (const entry of existing) {
      try {
        const stat = fs.statSync(entry.fsPath)
        if (stat.isDirectory()) {
          archive.directory(entry.fsPath, entry.archiveMember)
        } else {
          archive.file(entry.fsPath, { name: entry.archiveMember })
        }
      } catch {
        // Skip entries that can't be read
      }
    }
    archive.finalize()
  })
}

/**
 * Extract a tar.gz archive to a base directory using native tar command.
 * Available on macOS and Linux (the only supported platforms).
 */
function restoreArchive(blob: Buffer, baseDir: string): void {
  const tmpFile = path.join(os.tmpdir(), `config-undo-${Date.now()}.tar.gz`)
  try {
    fs.writeFileSync(tmpFile, blob)
    fs.mkdirSync(baseDir, { recursive: true })
    execSync(`tar xzf "${tmpFile}" -C "${baseDir}"`, { timeout: 60000 })
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
  }
}

// ---------------------------------------------------------------------------
// Transaction lifecycle
// ---------------------------------------------------------------------------

/**
 * Snapshot the BEFORE state of all specified files/dirs.
 * Returns a transaction ID. Call commitTransaction(txId) after the mutation
 * succeeds, or discardTransaction(txId) if it fails.
 */
export async function beginTransaction(opts: TransactionOptions): Promise<number> {
  const db = getDb()

  // Snapshot config files (synchronous — small JSON files)
  const configData: Record<string, { path: string; blob: Buffer | null }> = {}
  if (opts.configFiles) {
    for (const [col, filePath] of Object.entries(opts.configFiles)) {
      if (filePath) {
        configData[col] = { path: filePath, blob: snapshotFile(filePath) }
      }
    }
  }

  // Snapshot element dirs/files (async — may be large)
  let elementBlob: Buffer | null = null
  if (opts.elements && opts.elements.length > 0) {
    elementBlob = await snapshotPaths(opts.elements)
  }

  const elementExisted = opts.elements
    ? opts.elements.some(e => fs.existsSync(e.fsPath)) ? 1 : 0
    : 1

  const manifest = JSON.stringify(opts.elementManifest || [])

  // Build INSERT dynamically based on which columns are non-null
  const columns: string[] = [
    'description', 'operation', 'scope', 'agent_id',
    'element_blob', 'element_existed', 'element_manifest',
  ]
  const values: unknown[] = [
    opts.description, opts.operation, opts.scope, opts.agentId || null,
    elementBlob, elementExisted, manifest,
  ]

  for (const [col, data] of Object.entries(configData)) {
    columns.push(`${col}_path`, `${col}_blob`)
    values.push(data.path, data.blob)
  }

  const placeholders = columns.map(() => '?').join(', ')
  const sql = `INSERT INTO transactions (${columns.join(', ')}) VALUES (${placeholders})`

  const result = db.prepare(sql).run(...values)
  return Number(result.lastInsertRowid)
}

/**
 * Mark a transaction as complete (mutation succeeded).
 * Clears the redo stack because a new mutation invalidates redo history.
 */
export function commitTransaction(_txId: number): void {
  const db = getDb()
  db.prepare('DELETE FROM redo_transactions').run()
}

/**
 * Discard a transaction (mutation failed, no undo needed).
 */
export function discardTransaction(txId: number): void {
  const db = getDb()
  db.prepare('DELETE FROM transactions WHERE id = ?').run(txId)
}

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

/** Generic restore logic used by both undo and redo */
async function executeRestore(
  sourceTable: string,
  targetTable: string
): Promise<{ success: boolean; description?: string; error?: string }> {
  const db = getDb()

  // Get most recent row from source table
  const tx = db.prepare(`SELECT * FROM ${sourceTable} ORDER BY id DESC LIMIT 1`).get() as Record<string, unknown> | undefined
  if (!tx) return { success: false, error: `Nothing to ${sourceTable === 'transactions' ? 'undo' : 'redo'}` }

  try {
    // 1. Snapshot CURRENT state into target table (for reverse operation)
    const targetColumns: string[] = [
      'description', 'operation', 'scope', 'agent_id', 'element_manifest',
    ]
    const targetValues: unknown[] = [
      tx.description, tx.operation, tx.scope, tx.agent_id, tx.element_manifest,
    ]

    // Snapshot current config files
    for (const col of CONFIG_COLUMNS) {
      const pathVal = tx[`${col}_path`] as string | null
      if (pathVal) {
        targetColumns.push(`${col}_path`, `${col}_blob`)
        targetValues.push(pathVal, snapshotFile(pathVal))
      }
    }

    // Snapshot current element state
    const manifest: ManifestEntry[] = JSON.parse((tx.element_manifest as string) || '[]')
    if (manifest.length > 0) {
      const currentElementEntries = manifest
        .filter(m => m.path && fs.existsSync(m.path))
        .map(m => ({ fsPath: m.path!, archiveMember: m.tar_member }))
      const currentElementBlob = currentElementEntries.length > 0
        ? await snapshotPaths(currentElementEntries)
        : null
      const currentElementExisted = currentElementEntries.length > 0 ? 1 : 0
      targetColumns.push('element_blob', 'element_existed')
      targetValues.push(currentElementBlob, currentElementExisted)
    }

    const targetPlaceholders = targetColumns.map(() => '?').join(', ')
    db.prepare(
      `INSERT INTO ${targetTable} (${targetColumns.join(', ')}) VALUES (${targetPlaceholders})`
    ).run(...targetValues)

    // 2. Restore BEFORE state — config files
    for (const col of CONFIG_COLUMNS) {
      const pathVal = tx[`${col}_path`] as string | null
      const blobVal = tx[`${col}_blob`] as Buffer | null
      if (pathVal && blobVal) {
        restoreFile(pathVal, blobVal)
      } else if (pathVal && !blobVal) {
        // File didn't exist before — delete it
        try { fs.unlinkSync(pathVal) } catch {}
      }
    }

    // 3. Restore BEFORE state — elements via manifest
    const elementBlob = tx.element_blob as Buffer | null
    if (manifest.length > 0 && elementBlob) {
      const tmpDir = path.join(os.tmpdir(), `config-undo-restore-${Date.now()}`)
      restoreArchive(elementBlob, tmpDir)

      for (const entry of manifest) {
        if (!entry.path) continue
        if (entry.existed_before) {
          // Restore from archive
          const src = path.join(tmpDir, entry.tar_member)
          if (fs.existsSync(src)) {
            const stat = fs.statSync(src)
            if (stat.isDirectory()) {
              fs.rmSync(entry.path, { recursive: true, force: true })
              fs.mkdirSync(path.dirname(entry.path), { recursive: true })
              execSync(`cp -R "${src}" "${entry.path}"`, { timeout: 30000 })
            } else {
              fs.mkdirSync(path.dirname(entry.path), { recursive: true })
              fs.copyFileSync(src, entry.path)
            }
          }
        } else {
          // Element was created by the operation — remove it on undo
          try {
            const stat = fs.statSync(entry.path)
            if (stat.isDirectory()) {
              fs.rmSync(entry.path, { recursive: true, force: true })
            } else {
              fs.unlinkSync(entry.path)
            }
          } catch {}
        }
      }
      // Cleanup temp dir
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    } else if (manifest.length > 0 && !elementBlob) {
      // No blob = elements didn't exist before → delete them
      for (const entry of manifest) {
        if (!entry.path || entry.existed_before) continue
        try {
          const stat = fs.statSync(entry.path)
          if (stat.isDirectory()) {
            fs.rmSync(entry.path, { recursive: true, force: true })
          } else {
            fs.unlinkSync(entry.path)
          }
        } catch {}
      }
    }

    // 4. Delete the source row (consumed)
    db.prepare(`DELETE FROM ${sourceTable} WHERE id = ?`).run(tx.id)

    return { success: true, description: tx.description as string }
  } catch (err) {
    console.error(`[config-transaction] ${sourceTable === 'transactions' ? 'Undo' : 'Redo'} failed:`, err)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Undo the most recent transaction */
export async function undo(): Promise<{ success: boolean; description?: string; error?: string }> {
  return executeRestore('transactions', 'redo_transactions')
}

/** Redo the most recent undone transaction */
export async function redo(): Promise<{ success: boolean; description?: string; error?: string }> {
  return executeRestore('redo_transactions', 'transactions')
}

/** Get current undo/redo counts */
export function getStatus(): { undoCount: number; redoCount: number } {
  const db = getDb()
  const undoCount = (db.prepare('SELECT COUNT(*) as c FROM transactions').get() as { c: number }).c
  const redoCount = (db.prepare('SELECT COUNT(*) as c FROM redo_transactions').get() as { c: number }).c
  return { undoCount, redoCount }
}

/** Close the database connection (for graceful shutdown) */
export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

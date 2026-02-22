/**
 * Manager Trust Registry (Layer 4)
 *
 * Manages trust relationships between MANAGERs on different hosts.
 * When a trusted MANAGER submits a governance request, it can be
 * auto-approved without requiring manual MANAGER approval on the target host.
 *
 * Storage: ~/.aimaestro/manager-trust.json
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { withLock } from '@/lib/file-lock'
import type { GovernanceRequest } from '@/types/governance-request'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManagerTrust {
  hostId: string           // The trusted host's ID
  managerId: string        // The trusted MANAGER's agent UUID
  managerName: string      // Display name for the trusted MANAGER
  trustedAt: string        // ISO timestamp when trust was established
  autoApprove: boolean     // Whether to auto-approve requests from this manager
}

export interface ManagerTrustFile {
  version: 1
  trustedManagers: ManagerTrust[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const TRUST_FILE = path.join(AIMAESTRO_DIR, 'manager-trust.json')

const DEFAULT_TRUST_FILE: ManagerTrustFile = {
  version: 1,
  trustedManagers: [],
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Ensure ~/.aimaestro directory exists */
function ensureAimaestroDir(): void {
  if (!fs.existsSync(AIMAESTRO_DIR)) {
    fs.mkdirSync(AIMAESTRO_DIR, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// Load / Save (synchronous, matching governance-peers pattern)
// ---------------------------------------------------------------------------

/** Load manager trust file from disk, creating with defaults if missing */
export function loadManagerTrust(): ManagerTrustFile {
  ensureAimaestroDir()
  if (!fs.existsSync(TRUST_FILE)) {
    // First-time initialization: write defaults and return them
    saveManagerTrust(DEFAULT_TRUST_FILE)
    return { ...DEFAULT_TRUST_FILE, trustedManagers: [] }
  }
  try {
    const data = fs.readFileSync(TRUST_FILE, 'utf-8')
    const parsed: ManagerTrustFile = JSON.parse(data)
    return parsed
  } catch (error) {
    // Distinguish read errors from parse errors -- parse errors indicate disk corruption
    if (error instanceof SyntaxError) {
      console.error('[manager-trust] CORRUPTION: manager-trust.json contains invalid JSON -- returning defaults. Manual inspection required:', TRUST_FILE)
      // Backup corrupted file before returning defaults to prevent silent data loss
      try {
        const backupPath = TRUST_FILE + '.corrupted.' + Date.now()
        fs.copyFileSync(TRUST_FILE, backupPath)
        console.error(`[manager-trust] Corrupted file backed up to ${backupPath}`)
      } catch { /* backup is best-effort */ }
      // Heal the corrupted file by writing defaults
      saveManagerTrust(DEFAULT_TRUST_FILE)
    } else {
      console.error('[manager-trust] Failed to read manager trust file:', error)
    }
    return { ...DEFAULT_TRUST_FILE, trustedManagers: [] }
  }
}

/** Write manager trust file to disk using atomic temp-file-then-rename pattern */
export function saveManagerTrust(file: ManagerTrustFile): void {
  // Fail-fast: let errors propagate to callers (all wrapped in withLock try/catch)
  ensureAimaestroDir()
  // Atomic write: write to temp file then rename to avoid corruption on crash
  // SF-040: Include process.pid for multi-process safety
  const tmpFile = TRUST_FILE + `.tmp.${process.pid}`
  fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
  fs.renameSync(tmpFile, TRUST_FILE)
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Add a new trusted manager (or update existing trust for that hostId).
 * Uses withLock('manager-trust') to serialize concurrent modifications.
 * Returns the created/updated trust record.
 */
export async function addTrustedManager(params: {
  hostId: string
  managerId: string
  managerName: string
  autoApprove?: boolean
}): Promise<ManagerTrust> {
  return withLock('manager-trust', () => {
    const file = loadManagerTrust()
    const now = new Date().toISOString()

    // Check if trust already exists for this hostId -- update if so
    const existingIndex = file.trustedManagers.findIndex(
      (t) => t.hostId === params.hostId,
    )

    const trust: ManagerTrust = {
      hostId: params.hostId,
      managerId: params.managerId,
      managerName: params.managerName,
      trustedAt: now,
      autoApprove: params.autoApprove ?? true,
    }

    if (existingIndex >= 0) {
      // Update existing trust record in place
      file.trustedManagers[existingIndex] = trust
    } else {
      // Add new trust record
      file.trustedManagers.push(trust)
    }

    saveManagerTrust(file)
    return trust
  })
}

/**
 * Remove trust for a host.
 * Uses withLock('manager-trust') to serialize concurrent modifications.
 * Returns true if a trust record was removed, false if not found.
 */
export async function removeTrustedManager(hostId: string): Promise<boolean> {
  return withLock('manager-trust', () => {
    const file = loadManagerTrust()
    const initialLength = file.trustedManagers.length

    file.trustedManagers = file.trustedManagers.filter(
      (t) => t.hostId !== hostId,
    )

    if (file.trustedManagers.length === initialLength) {
      // Nothing was removed -- hostId not found
      return false
    }

    saveManagerTrust(file)
    return true
  })
}

// ---------------------------------------------------------------------------
// Query operations (synchronous reads, no lock needed)
// ---------------------------------------------------------------------------

/**
 * Check if a specific manager on a host is trusted.
 * Both hostId and managerId must match for a positive result.
 */
export function isTrustedManager(hostId: string, managerId: string): boolean {
  const file = loadManagerTrust()
  return file.trustedManagers.some(
    (t) => t.hostId === hostId && t.managerId === managerId,
  )
}

/** Return all trusted managers */
export function getTrustedManagers(): ManagerTrust[] {
  const file = loadManagerTrust()
  return file.trustedManagers
}

/**
 * Determine if a cross-host governance request should be auto-approved.
 *
 * Logic:
 * 1. Find the trust record for request.sourceHostId
 * 2. Verify the trust record's managerId matches request.requestedBy (a plain UUID)
 * 3. Verify autoApprove is true on the trust record
 * 4. Return true only if all conditions are met
 */
export function shouldAutoApprove(request: GovernanceRequest): boolean {
  const file = loadManagerTrust()

  // Find trust record for the source host
  const trust = file.trustedManagers.find(
    (t) => t.hostId === request.sourceHostId,
  )
  if (!trust) return false

  // Auto-approve must be enabled on this trust relationship
  if (!trust.autoApprove) return false

  // The requesting agent must be the trusted manager for that host
  return trust.managerId === request.requestedBy
}

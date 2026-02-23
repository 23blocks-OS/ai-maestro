/**
 * Transfer Registry — manages team transfer requests
 *
 * When a COS or MANAGER tries to move an agent from a closed team
 * led by a different COS, a transfer request is created that must
 * be approved by the source team's COS before the move takes effect.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, renameSync } from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import type { TransferRequest, TransfersFile } from '@/types/governance'
import { withLock } from '@/lib/file-lock'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const TRANSFERS_FILE = path.join(AIMAESTRO_DIR, 'governance-transfers.json')

function ensureDir(): void {
  if (!existsSync(AIMAESTRO_DIR)) {
    mkdirSync(AIMAESTRO_DIR, { recursive: true })
  }
}

/** Load all transfer requests from disk */
export function loadTransfers(): TransferRequest[] {
  ensureDir()
  if (!existsSync(TRANSFERS_FILE)) {
    return []
  }
  try {
    const raw = readFileSync(TRANSFERS_FILE, 'utf-8')
    const data: TransfersFile = JSON.parse(raw)
    // Validate requests is actually an array (matches team-registry pattern)
    return Array.isArray(data.requests) ? data.requests : []
  } catch (error) {
    // Distinguish read errors from parse errors — parse errors indicate disk corruption
    if (error instanceof SyntaxError) {
      console.error('[transfer-registry] CORRUPTION: governance-transfers.json contains invalid JSON — returning defaults. Manual inspection required:', TRANSFERS_FILE)
      // Backup corrupted file before returning defaults to prevent silent data loss
      try {
        const backupPath = TRANSFERS_FILE + '.corrupted.' + Date.now()
        copyFileSync(TRANSFERS_FILE, backupPath)
        console.error(`[transfer-registry] Corrupted file backed up to ${backupPath}`)
      } catch { /* backup is best-effort */ }
      // Heal the corrupted file by writing empty defaults, matching governance.ts pattern
      saveTransfers([])
    } else {
      console.error('[transfer-registry] Error loading transfers:', error)
    }
    return []
  }
}

/** Save transfer requests to disk */
function saveTransfers(requests: TransferRequest[]): void {
  ensureDir()
  const data: TransfersFile = { version: 1, requests }
  // SF-002 (P5): Atomic write -- write to temp file then rename to prevent corruption on crash
  const tmpFile = `${TRANSFERS_FILE}.tmp.${process.pid}`
  writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmpFile, TRANSFERS_FILE)
}

/** Create a new pending transfer request */
export async function createTransferRequest(params: {
  agentId: string
  fromTeamId: string
  toTeamId: string
  requestedBy: string
  note?: string
}): Promise<TransferRequest> {
  return withLock('transfers', () => {
    const requests = loadTransfers()
    // Prevent duplicate pending transfers for the same agent+team combination
    const duplicate = requests.find(r =>
      r.agentId === params.agentId &&
      r.fromTeamId === params.fromTeamId &&
      r.toTeamId === params.toTeamId &&
      r.status === 'pending'
    )
    if (duplicate) {
      throw new Error('A pending transfer request already exists for this agent and team combination')
    }
    const request: TransferRequest = {
      id: randomUUID(),
      agentId: params.agentId,
      fromTeamId: params.fromTeamId,
      toTeamId: params.toTeamId,
      requestedBy: params.requestedBy,
      status: 'pending',
      createdAt: new Date().toISOString(),
      note: params.note,
    }
    requests.push(request)
    saveTransfers(requests)
    return request
  })
}

/** Get a transfer request by ID */
export function getTransferRequest(id: string): TransferRequest | null {
  const requests = loadTransfers()
  return requests.find(r => r.id === id) || null
}

/** Get all pending transfer requests for a specific team (as source) */
export function getPendingTransfersForTeam(teamId: string): TransferRequest[] {
  const requests = loadTransfers()
  return requests.filter(r => r.fromTeamId === teamId && r.status === 'pending')
}

/** Get all pending transfer requests involving a specific agent */
export function getPendingTransfersForAgent(agentId: string): TransferRequest[] {
  const requests = loadTransfers()
  return requests.filter(r => r.agentId === agentId && r.status === 'pending')
}

/** Resolve (approve or reject) a transfer request */
export async function resolveTransferRequest(
  id: string,
  status: 'approved' | 'rejected',
  resolvedBy: string,
  rejectReason?: string
): Promise<TransferRequest | null> {
  return withLock('transfers', () => {
    const requests = loadTransfers()
    const idx = requests.findIndex(r => r.id === id)
    if (idx === -1) return null
    if (requests[idx].status !== 'pending') return null // Already resolved

    requests[idx] = {
      ...requests[idx],
      status,
      resolvedAt: new Date().toISOString(),
      resolvedBy,
      rejectReason: status === 'rejected' ? rejectReason : undefined,
    }
    saveTransfers(requests)
    return requests[idx]
  })
}

/** Revert an approved/rejected transfer back to pending state.
 *  Used as a compensating action when a downstream operation (e.g. saveTeams)
 *  fails after the transfer was already marked as approved on disk. */
export async function revertTransferToPending(id: string): Promise<boolean> {
  return withLock('transfers', () => {
    const requests = loadTransfers()
    const idx = requests.findIndex(r => r.id === id)
    if (idx === -1) return false
    // Already pending -- skip redundant disk write
    if (requests[idx].status === 'pending') return true

    requests[idx] = {
      ...requests[idx],
      status: 'pending',
      resolvedAt: undefined,
      resolvedBy: undefined,
      rejectReason: undefined,
    }
    saveTransfers(requests)
    return true
  })
}

// Exported for future scheduled cleanup integration
/** Clean up old resolved requests (older than 30 days) */
export async function cleanupOldTransfers(): Promise<number> {
  return withLock('transfers', () => {
    const requests = loadTransfers()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)

    const filtered = requests.filter(r => {
      if (r.status === 'pending') return true // Keep all pending
      // Use numeric comparison to avoid string-based ISO timestamp comparison pitfalls
      return new Date(r.resolvedAt || r.createdAt).getTime() > cutoff.getTime()
    })

    const removed = requests.length - filtered.length
    if (removed > 0) saveTransfers(filtered)
    return removed
  })
}

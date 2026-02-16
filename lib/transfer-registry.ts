/**
 * Transfer Registry — manages team transfer requests
 *
 * When a COS or MANAGER tries to move an agent from a closed team
 * led by a different COS, a transfer request is created that must
 * be approved by the source team's COS before the move takes effect.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { TransferRequest, TransfersFile } from '@/types/governance'
import { withLock } from '@/lib/file-lock'

const AI_MAESTRO_DIR = path.join(process.env.HOME || '~', '.aimaestro')
const TRANSFERS_FILE = path.join(AI_MAESTRO_DIR, 'governance-transfers.json')

function ensureDir(): void {
  if (!existsSync(AI_MAESTRO_DIR)) {
    mkdirSync(AI_MAESTRO_DIR, { recursive: true })
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
    return data.requests || []
  } catch {
    return []
  }
}

/** Save transfer requests to disk */
function saveTransfers(requests: TransferRequest[]): void {
  ensureDir()
  const data: TransfersFile = { version: 1, requests }
  writeFileSync(TRANSFERS_FILE, JSON.stringify(data, null, 2), 'utf-8')
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

/** Clean up old resolved requests (older than 30 days) */
export async function cleanupOldTransfers(): Promise<number> {
  return withLock('transfers', () => {
    const requests = loadTransfers()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = cutoff.toISOString()

    const filtered = requests.filter(r => {
      if (r.status === 'pending') return true // Keep all pending
      return (r.resolvedAt || r.createdAt) > cutoffStr
    })

    const removed = requests.length - filtered.length
    if (removed > 0) saveTransfers(filtered)
    return removed
  })
}

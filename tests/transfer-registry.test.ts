import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import os from 'os'

// ============================================================================
// Mocks
// ============================================================================

let fsStore: Record<string, string> = {}

// Named exports mock (not default) because transfer-registry.ts uses named imports: import { readFileSync, ... } from 'fs'
vi.mock('fs', () => ({
  existsSync: vi.fn((filePath: string) => filePath in fsStore),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((filePath: string) => {
    if (filePath in fsStore) return fsStore[filePath]
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`)
  }),
  writeFileSync: vi.fn((filePath: string, data: string) => {
    fsStore[filePath] = data
  }),
  renameSync: vi.fn((src: string, dest: string) => {
    if (!(src in fsStore)) throw new Error(`ENOENT: no such file or directory, rename '${src}'`)
    fsStore[dest] = fsStore[src]
    delete fsStore[src]
  }),
  copyFileSync: vi.fn((src: string, dest: string) => {
    if (!(src in fsStore)) throw new Error(`ENOENT: no such file or directory, copyfile '${src}'`)
    fsStore[dest] = fsStore[src]
  }),
}))

let uuidCounter = 0
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => `uuid-${++uuidCounter}`),
}))

vi.mock('@/lib/file-lock', () => ({
  withLock: vi.fn((_name: string, fn: () => any) => Promise.resolve(fn())),
}))

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import {
  loadTransfers,
  createTransferRequest,
  getTransferRequest,
  getPendingTransfersForTeam,
  getPendingTransfersForAgent,
  resolveTransferRequest,
  revertTransferToPending,
  cleanupOldTransfers,
} from '@/lib/transfer-registry'
import type { TransferRequest, TransfersFile } from '@/types/governance'

// ============================================================================
// Test helpers
// ============================================================================

const AI_MAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const TRANSFERS_FILE = path.join(AI_MAESTRO_DIR, 'governance-transfers.json')

function seedTransfers(requests: TransferRequest[]): void {
  const data: TransfersFile = { version: 1, requests }
  fsStore[TRANSFERS_FILE] = JSON.stringify(data, null, 2)
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  fsStore = {}
  uuidCounter = 0
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// loadTransfers
// ============================================================================

describe('loadTransfers', () => {
  it('returns empty array when no file exists', () => {
    /** Verifies that loadTransfers gracefully returns [] when the transfers file has not been created yet */
    const result = loadTransfers()
    expect(result).toEqual([])
  })

  it('reads existing transfers from disk', () => {
    /** Verifies that loadTransfers correctly parses and returns transfers stored in the JSON file */
    const existing: TransferRequest = {
      id: 'tr-1',
      agentId: 'agent-a',
      fromTeamId: 'team-alpha',
      toTeamId: 'team-beta',
      requestedBy: 'manager-1',
      status: 'pending',
      createdAt: '2025-05-01T10:00:00.000Z',
      note: 'Need this agent on beta',
    }
    seedTransfers([existing])

    const result = loadTransfers()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('tr-1')
    expect(result[0].agentId).toBe('agent-a')
    expect(result[0].fromTeamId).toBe('team-alpha')
    expect(result[0].toTeamId).toBe('team-beta')
    expect(result[0].status).toBe('pending')
    expect(result[0].note).toBe('Need this agent on beta')
  })
})

// ============================================================================
// createTransferRequest
// ============================================================================

describe('createTransferRequest', () => {
  it('creates a pending transfer and persists it', async () => {
    /** Verifies that createTransferRequest generates a UUID, sets status to pending, timestamps it, and writes to disk */
    const transfer = await createTransferRequest({
      agentId: 'agent-x',
      fromTeamId: 'team-source',
      toTeamId: 'team-dest',
      requestedBy: 'cos-1',
      note: 'Strategic reallocation',
    })

    expect(transfer.id).toBe('uuid-1')
    expect(transfer.agentId).toBe('agent-x')
    expect(transfer.fromTeamId).toBe('team-source')
    expect(transfer.toTeamId).toBe('team-dest')
    expect(transfer.requestedBy).toBe('cos-1')
    expect(transfer.status).toBe('pending')
    expect(transfer.createdAt).toBe('2025-06-01T12:00:00.000Z')
    expect(transfer.note).toBe('Strategic reallocation')

    // Verify persistence
    const persisted = loadTransfers()
    expect(persisted).toHaveLength(1)
    expect(persisted[0].id).toBe('uuid-1')
  })
})

// ============================================================================
// getTransferRequest
// ============================================================================

describe('getTransferRequest', () => {
  it('returns a transfer by ID, or null if not found', async () => {
    /** Verifies that getTransferRequest finds an existing transfer by ID and returns null for unknown IDs */
    await createTransferRequest({
      agentId: 'agent-1',
      fromTeamId: 'team-a',
      toTeamId: 'team-b',
      requestedBy: 'cos-1',
    })

    const found = getTransferRequest('uuid-1')
    expect(found).not.toBeNull()
    expect(found!.agentId).toBe('agent-1')

    const notFound = getTransferRequest('nonexistent-id')
    expect(notFound).toBeNull()
  })
})

// ============================================================================
// getPendingTransfersForTeam
// ============================================================================

describe('getPendingTransfersForTeam', () => {
  it('filters by fromTeamId and pending status', () => {
    /** Verifies that only pending transfers from the specified source team are returned */
    const transfers: TransferRequest[] = [
      {
        id: 'tr-1',
        agentId: 'agent-a',
        fromTeamId: 'team-alpha',
        toTeamId: 'team-beta',
        requestedBy: 'cos-1',
        status: 'pending',
        createdAt: '2025-05-01T10:00:00.000Z',
      },
      {
        id: 'tr-2',
        agentId: 'agent-b',
        fromTeamId: 'team-alpha',
        toTeamId: 'team-gamma',
        requestedBy: 'cos-1',
        status: 'approved',
        createdAt: '2025-05-01T11:00:00.000Z',
        resolvedAt: '2025-05-02T09:00:00.000Z',
        resolvedBy: 'cos-alpha',
      },
      {
        id: 'tr-3',
        agentId: 'agent-c',
        fromTeamId: 'team-beta',
        toTeamId: 'team-alpha',
        requestedBy: 'cos-2',
        status: 'pending',
        createdAt: '2025-05-01T12:00:00.000Z',
      },
    ]
    seedTransfers(transfers)

    const result = getPendingTransfersForTeam('team-alpha')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('tr-1')
  })
})

// ============================================================================
// getPendingTransfersForAgent
// ============================================================================

describe('getPendingTransfersForAgent', () => {
  it('filters by agentId and pending status', () => {
    /** Verifies that only pending transfers involving the specified agent are returned */
    const transfers: TransferRequest[] = [
      {
        id: 'tr-1',
        agentId: 'agent-x',
        fromTeamId: 'team-a',
        toTeamId: 'team-b',
        requestedBy: 'cos-1',
        status: 'pending',
        createdAt: '2025-05-01T10:00:00.000Z',
      },
      {
        id: 'tr-2',
        agentId: 'agent-x',
        fromTeamId: 'team-c',
        toTeamId: 'team-d',
        requestedBy: 'cos-2',
        status: 'rejected',
        createdAt: '2025-05-01T11:00:00.000Z',
        resolvedAt: '2025-05-02T09:00:00.000Z',
        resolvedBy: 'cos-c',
        rejectReason: 'Not approved',
      },
      {
        id: 'tr-3',
        agentId: 'agent-y',
        fromTeamId: 'team-a',
        toTeamId: 'team-b',
        requestedBy: 'cos-1',
        status: 'pending',
        createdAt: '2025-05-01T12:00:00.000Z',
      },
    ]
    seedTransfers(transfers)

    const result = getPendingTransfersForAgent('agent-x')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('tr-1')
  })
})

// ============================================================================
// resolveTransferRequest
// ============================================================================

describe('resolveTransferRequest', () => {
  it('approves a pending transfer, sets resolvedAt and resolvedBy', async () => {
    /** Verifies that resolving as approved updates status, resolvedAt, resolvedBy and persists changes */
    await createTransferRequest({
      agentId: 'agent-1',
      fromTeamId: 'team-src',
      toTeamId: 'team-dst',
      requestedBy: 'manager-1',
    })

    const resolved = await resolveTransferRequest('uuid-1', 'approved', 'cos-src')
    expect(resolved).not.toBeNull()
    expect(resolved!.status).toBe('approved')
    expect(resolved!.resolvedAt).toBe('2025-06-01T12:00:00.000Z')
    expect(resolved!.resolvedBy).toBe('cos-src')
    expect(resolved!.rejectReason).toBeUndefined()

    // Verify persistence
    const persisted = getTransferRequest('uuid-1')
    expect(persisted!.status).toBe('approved')
  })

  it('rejects a pending transfer with rejectReason', async () => {
    /** Verifies that resolving as rejected updates status, sets rejectReason, and persists changes */
    await createTransferRequest({
      agentId: 'agent-2',
      fromTeamId: 'team-src',
      toTeamId: 'team-dst',
      requestedBy: 'manager-2',
    })

    const resolved = await resolveTransferRequest(
      'uuid-1',
      'rejected',
      'cos-src',
      'Agent is critical to current project'
    )
    expect(resolved).not.toBeNull()
    expect(resolved!.status).toBe('rejected')
    expect(resolved!.resolvedAt).toBe('2025-06-01T12:00:00.000Z')
    expect(resolved!.resolvedBy).toBe('cos-src')
    expect(resolved!.rejectReason).toBe('Agent is critical to current project')

    // Verify persistence
    const persisted = getTransferRequest('uuid-1')
    expect(persisted!.status).toBe('rejected')
    expect(persisted!.rejectReason).toBe('Agent is critical to current project')
  })

  it('returns null when approving an already-approved transfer (idempotency)', async () => {
    /** Verifies that resolving an already-resolved transfer is a no-op and returns null */
    await createTransferRequest({
      agentId: 'agent-idem',
      fromTeamId: 'team-src',
      toTeamId: 'team-dst',
      requestedBy: 'manager-idem',
    })

    // First approval succeeds
    const first = await resolveTransferRequest('uuid-1', 'approved', 'cos-src')
    expect(first).not.toBeNull()
    expect(first!.status).toBe('approved')

    // Second approval on the same (now non-pending) transfer returns null
    const second = await resolveTransferRequest('uuid-1', 'approved', 'cos-src')
    expect(second).toBeNull()

    // Original resolution remains unchanged
    const persisted = getTransferRequest('uuid-1')
    expect(persisted!.status).toBe('approved')
    expect(persisted!.resolvedBy).toBe('cos-src')
  })
})

// ============================================================================
// revertTransferToPending (SF-031)
// ============================================================================

describe('revertTransferToPending', () => {
  it('reverts an approved transfer back to pending status', async () => {
    /** Verifies that revertTransferToPending clears resolution fields and sets status back to pending */
    await createTransferRequest({
      agentId: 'agent-revert',
      fromTeamId: 'team-src',
      toTeamId: 'team-dst',
      requestedBy: 'cos-1',
    })

    // First approve the transfer
    await resolveTransferRequest('uuid-1', 'approved', 'cos-src')
    const approved = getTransferRequest('uuid-1')
    expect(approved!.status).toBe('approved')
    expect(approved!.resolvedAt).toBeDefined()
    expect(approved!.resolvedBy).toBe('cos-src')

    // Revert to pending (compensating action)
    const reverted = await revertTransferToPending('uuid-1')
    expect(reverted).toBe(true)

    // Verify the transfer is back to pending with resolution fields cleared
    const persisted = getTransferRequest('uuid-1')
    expect(persisted!.status).toBe('pending')
    expect(persisted!.resolvedAt).toBeUndefined()
    expect(persisted!.resolvedBy).toBeUndefined()
    expect(persisted!.rejectReason).toBeUndefined()
  })

  it('returns true without disk write when transfer is already pending', async () => {
    /** Verifies that reverting an already-pending transfer is a no-op that returns true */
    await createTransferRequest({
      agentId: 'agent-already-pending',
      fromTeamId: 'team-src',
      toTeamId: 'team-dst',
      requestedBy: 'cos-1',
    })

    const result = await revertTransferToPending('uuid-1')
    expect(result).toBe(true)

    const persisted = getTransferRequest('uuid-1')
    expect(persisted!.status).toBe('pending')
  })

  it('returns false for non-existent transfer ID', async () => {
    /** Verifies that reverting a non-existent transfer returns false */
    const result = await revertTransferToPending('nonexistent-id')
    expect(result).toBe(false)
  })
})

// ============================================================================
// cleanupOldTransfers (SF-031)
// ============================================================================

describe('cleanupOldTransfers', () => {
  it('removes resolved transfers older than 30 days', async () => {
    /** Verifies that resolved transfers older than 30 days are removed, pending transfers are kept */
    const oldDate = '2025-04-01T10:00:00.000Z' // Well over 30 days before 2025-06-01
    const recentDate = '2025-05-25T10:00:00.000Z' // Within 30 days of 2025-06-01

    seedTransfers([
      {
        id: 'tr-old',
        agentId: 'agent-a',
        fromTeamId: 'team-src',
        toTeamId: 'team-dst',
        requestedBy: 'cos-1',
        status: 'approved',
        createdAt: oldDate,
        resolvedAt: oldDate,
        resolvedBy: 'cos-1',
      },
      {
        id: 'tr-recent',
        agentId: 'agent-b',
        fromTeamId: 'team-src',
        toTeamId: 'team-dst',
        requestedBy: 'cos-2',
        status: 'rejected',
        createdAt: recentDate,
        resolvedAt: recentDate,
        resolvedBy: 'cos-2',
        rejectReason: 'Not needed',
      },
      {
        id: 'tr-pending',
        agentId: 'agent-c',
        fromTeamId: 'team-src',
        toTeamId: 'team-dst',
        requestedBy: 'cos-3',
        status: 'pending',
        createdAt: oldDate, // Old but pending -- should NOT be removed
      },
    ])

    const removed = await cleanupOldTransfers()

    expect(removed).toBe(1) // Only tr-old should be removed
    const remaining = loadTransfers()
    expect(remaining).toHaveLength(2)
    expect(remaining.find(r => r.id === 'tr-old')).toBeUndefined()
    expect(remaining.find(r => r.id === 'tr-recent')).toBeDefined()
    expect(remaining.find(r => r.id === 'tr-pending')).toBeDefined()
  })

  it('returns 0 when no transfers are old enough to clean up', async () => {
    /** Verifies that cleanupOldTransfers returns 0 when all transfers are recent */
    seedTransfers([
      {
        id: 'tr-recent-only',
        agentId: 'agent-a',
        fromTeamId: 'team-src',
        toTeamId: 'team-dst',
        requestedBy: 'cos-1',
        status: 'approved',
        createdAt: '2025-05-28T10:00:00.000Z',
        resolvedAt: '2025-05-28T10:00:00.000Z',
        resolvedBy: 'cos-1',
      },
    ])

    const removed = await cleanupOldTransfers()
    expect(removed).toBe(0)
    expect(loadTransfers()).toHaveLength(1)
  })
})

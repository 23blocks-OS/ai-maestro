import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

// ============================================================================
// Mocks
// ============================================================================

let fsStore: Record<string, string> = {}

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
})

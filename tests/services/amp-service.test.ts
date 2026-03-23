/**
 * AMP Service Tests
 *
 * Tests the pure business logic in services/amp-service.ts.
 * Mocks all lib/ dependencies — service tests validate orchestration,
 * not filesystem I/O (which lib tests already cover).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeAgent, resetFixtureCounter } from '../test-utils/fixtures'

// ============================================================================
// Mocks — vi.hoisted() ensures availability before vi.mock() runs
// ============================================================================

const {
  mockAgentRegistry,
  mockAmpAuth,
  mockAmpKeys,
  mockAmpRelay,
  mockDelivery,
  mockAmpInboxWriter,
  mockAmpWebSocket,
  mockMessageQueue,
  mockHostsConfig,
  mockAmpTypes,
} = vi.hoisted(() => ({
  mockAgentRegistry: {
    loadAgents: vi.fn().mockReturnValue([]),
    createAgent: vi.fn(),
    getAgent: vi.fn(),
    getAgentByName: vi.fn(),
    getAgentByNameAnyHost: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    markAgentAsAMPRegistered: vi.fn(),
    checkMeshAgentExists: vi.fn(),
    getAMPRegisteredAgents: vi.fn().mockReturnValue([]),
  },
  mockAmpAuth: {
    authenticateRequest: vi.fn().mockReturnValue({ authenticated: false, error: 'unauthorized', message: 'Authentication required' }),
    createApiKey: vi.fn(),
    hashApiKey: vi.fn(),
    extractApiKeyFromHeader: vi.fn().mockReturnValue(null),
    revokeApiKey: vi.fn(),
    rotateApiKey: vi.fn(),
    revokeAllKeysForAgent: vi.fn(),
  },
  mockAmpKeys: {
    saveKeyPair: vi.fn(),
    loadKeyPair: vi.fn().mockReturnValue(null),
    calculateFingerprint: vi.fn().mockReturnValue('SHA256:test-fingerprint'),
    verifySignature: vi.fn().mockReturnValue(true),
    generateKeyPair: vi.fn(),
  },
  mockAmpRelay: {
    queueMessage: vi.fn(),
    getPendingMessages: vi.fn().mockReturnValue({ messages: [], total: 0 }),
    acknowledgeMessage: vi.fn().mockReturnValue(true),
    acknowledgeMessages: vi.fn().mockReturnValue(0),
    cleanupAllExpiredMessages: vi.fn(),
  },
  mockDelivery: {
    deliver: vi.fn(),
  },
  mockAmpInboxWriter: {
    initAgentAMPHome: vi.fn(),
  },
  mockAmpWebSocket: {
    deliverViaWebSocket: vi.fn().mockReturnValue(false),
  },
  mockMessageQueue: {
    resolveAgentIdentifier: vi.fn(),
  },
  mockHostsConfig: {
    getSelfHostId: vi.fn().mockReturnValue('test-host'),
    getSelfHost: vi.fn().mockReturnValue({ id: 'test-host', name: 'Test Host', url: 'http://localhost:23000' }),
    getHostById: vi.fn().mockReturnValue(null),
    isSelf: vi.fn().mockReturnValue(true),
    getOrganization: vi.fn().mockReturnValue('testorg'),
  },
  mockAmpTypes: {
    AMP_PROTOCOL_VERSION: '0.1.0',
    getAMPProviderDomain: vi.fn().mockReturnValue('testorg.aimaestro.local'),
  },
}))

vi.mock('@/lib/agent-registry', () => mockAgentRegistry)
vi.mock('@/lib/amp-auth', () => mockAmpAuth)
vi.mock('@/lib/amp-keys', () => mockAmpKeys)
vi.mock('@/lib/amp-relay', () => mockAmpRelay)
vi.mock('@/lib/message-delivery', () => mockDelivery)
vi.mock('@/lib/amp-inbox-writer', () => mockAmpInboxWriter)
vi.mock('@/lib/amp-websocket', () => mockAmpWebSocket)
vi.mock('@/lib/messageQueue', () => mockMessageQueue)
vi.mock('@/lib/hosts-config-server.mjs', () => mockHostsConfig)
vi.mock('@/lib/types/amp', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/types/amp')
  return { ...actual, ...mockAmpTypes }
})

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import {
  getHealthStatus,
  getProviderInfo,
  listPendingMessages,
  acknowledgePendingMessage,
  batchAcknowledgeMessages,
  listAMPAgents,
  getAgentSelf,
  getAgentCard,
  updateAgentSelf,
  deleteAgentSelf,
  resolveAgentAddress,
  revokeKey,
  rotateKey,
  rotateKeypair,
  registerAgent,
} from '@/services/amp-service'

// ============================================================================
// Test constants
// ============================================================================

/** Real Ed25519 PEM for tests (extractPublicKeyHex uses crypto.createPublicKey) */
const TEST_ED25519_PEM = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAI6oyzfEh2pUxQ2+qFoZ2bZZ9q6kDsSbFmAzLVe89qcs=\n-----END PUBLIC KEY-----\n'

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  resetFixtureCounter()
})

/** Helper: set up a successful auth context */
function mockAuthenticated(overrides: Partial<{ agentId: string; address: string; tenantId: string }> = {}) {
  mockAmpAuth.authenticateRequest.mockReturnValue({
    authenticated: true,
    agentId: overrides.agentId ?? 'agent-1',
    address: overrides.address ?? 'alice@testorg.aimaestro.local',
    tenantId: overrides.tenantId ?? 'testorg',
  })
}

/** Helper: set up a failed auth context */
function mockUnauthenticated() {
  mockAmpAuth.authenticateRequest.mockReturnValue({
    authenticated: false,
    error: 'unauthorized',
    message: 'Authentication required',
  })
}

// ============================================================================
// GET /api/v1/health
// ============================================================================

describe('getHealthStatus', () => {
  it('returns healthy with agent count', () => {
    const onlineAgent = makeAgent({
      sessions: [{ index: 0, status: 'online', createdAt: '', lastActive: '' }],
    })
    const offlineAgent = makeAgent({
      sessions: [{ index: 0, status: 'offline', createdAt: '', lastActive: '' }],
    })
    mockAgentRegistry.loadAgents.mockReturnValue([onlineAgent, offlineAgent])

    const result = getHealthStatus()

    expect(result.status).toBe(200)
    expect(result.data?.status).toBe('healthy')
    expect(result.data?.agents_online).toBe(1)
    expect(result.data?.provider).toBe('testorg.aimaestro.local')
    expect(result.data?.version).toBe('0.1.0')
    expect(result.data?.uptime_seconds).toBeGreaterThanOrEqual(0)
  })

  it('returns unhealthy on error', () => {
    mockAgentRegistry.loadAgents.mockImplementation(() => { throw new Error('boom') })

    const result = getHealthStatus()

    expect(result.status).toBe(503)
    expect(result.data?.status).toBe('unhealthy')
    expect(result.data?.agents_online).toBe(0)
  })

  it('includes no-cache headers', () => {
    mockAgentRegistry.loadAgents.mockReturnValue([])
    const result = getHealthStatus()
    expect(result.headers?.['Cache-Control']).toBe('no-cache, no-store, must-revalidate')
  })
})

// ============================================================================
// GET /api/v1/info
// ============================================================================

describe('getProviderInfo', () => {
  it('returns provider capabilities', () => {
    const result = getProviderInfo()

    expect(result.status).toBe(200)
    expect(result.data?.provider).toBe('testorg.aimaestro.local')
    expect(result.data?.version).toBe('amp/0.1.0')
    expect(result.data?.capabilities).toContain('registration')
    expect(result.data?.capabilities).toContain('local-delivery')
    expect(result.data?.capabilities).toContain('relay-queue')
    expect(result.data?.capabilities).toContain('mesh-routing')
    expect(result.data?.registration_modes).toEqual(['open'])
    expect(result.data?.rate_limits).toBeDefined()
  })

  it('includes cache headers', () => {
    const result = getProviderInfo()
    expect(result.headers?.['Cache-Control']).toBe('public, max-age=300')
  })
})

// ============================================================================
// GET /api/v1/messages/pending
// ============================================================================

describe('listPendingMessages', () => {
  it('returns 401 without auth', () => {
    mockUnauthenticated()
    const result = listPendingMessages(null)
    expect(result.status).toBe(401)
    expect(result.data).toHaveProperty('error', 'unauthorized')
  })

  it('returns pending messages for authenticated agent', () => {
    mockAuthenticated()
    const pending = { messages: [{ id: 'msg-1', from: 'bob', subject: 'hi' }], total: 1 }
    mockAmpRelay.getPendingMessages.mockReturnValue(pending)

    const result = listPendingMessages('Bearer test-key')

    expect(result.status).toBe(200)
    expect(result.data).toEqual(pending)
    expect(mockAmpRelay.getPendingMessages).toHaveBeenCalledWith('agent-1', 10)
  })

  it('respects limit parameter (capped at 100)', () => {
    mockAuthenticated()
    mockAmpRelay.getPendingMessages.mockReturnValue({ messages: [], total: 0 })

    listPendingMessages('Bearer test-key', 50)
    expect(mockAmpRelay.getPendingMessages).toHaveBeenCalledWith('agent-1', 50)

    listPendingMessages('Bearer test-key', 200)
    expect(mockAmpRelay.getPendingMessages).toHaveBeenCalledWith('agent-1', 100)
  })

  it('defaults to limit 10 when not specified', () => {
    mockAuthenticated()
    mockAmpRelay.getPendingMessages.mockReturnValue({ messages: [], total: 0 })

    listPendingMessages('Bearer test-key')
    expect(mockAmpRelay.getPendingMessages).toHaveBeenCalledWith('agent-1', 10)
  })

  it('includes no-cache headers', () => {
    mockAuthenticated()
    mockAmpRelay.getPendingMessages.mockReturnValue({ messages: [], total: 0 })

    const result = listPendingMessages('Bearer test-key')
    expect(result.headers?.['Cache-Control']).toBe('no-cache, no-store, must-revalidate')
  })
})

// ============================================================================
// DELETE /api/v1/messages/pending
// ============================================================================

describe('acknowledgePendingMessage', () => {
  it('returns 401 without auth', () => {
    mockUnauthenticated()
    const result = acknowledgePendingMessage(null, 'msg-1')
    expect(result.status).toBe(401)
  })

  it('returns 400 when message ID is missing', () => {
    mockAuthenticated()
    const result = acknowledgePendingMessage('Bearer test-key', null)
    expect(result.status).toBe(400)
    expect(result.data).toHaveProperty('error', 'missing_field')
  })

  it('returns 404 when message not found', () => {
    mockAuthenticated()
    mockAmpRelay.acknowledgeMessage.mockReturnValue(false)

    const result = acknowledgePendingMessage('Bearer test-key', 'msg-nonexistent')
    expect(result.status).toBe(404)
    expect(result.data).toHaveProperty('error', 'not_found')
  })

  it('acknowledges a valid message', () => {
    mockAuthenticated()
    mockAmpRelay.acknowledgeMessage.mockReturnValue(true)

    const result = acknowledgePendingMessage('Bearer test-key', 'msg-1')

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ acknowledged: true })
    expect(mockAmpRelay.acknowledgeMessage).toHaveBeenCalledWith('agent-1', 'msg-1')
  })
})

// ============================================================================
// POST /api/v1/messages/pending/ack (and compat POST /messages/pending)
// ============================================================================

describe('batchAcknowledgeMessages', () => {
  it('returns 401 without auth', () => {
    mockUnauthenticated()
    const result = batchAcknowledgeMessages(null, ['msg-1'])
    expect(result.status).toBe(401)
  })

  it('returns 400 when ids is missing', () => {
    mockAuthenticated()
    const result = batchAcknowledgeMessages('Bearer test-key', undefined)
    expect(result.status).toBe(400)
    expect(result.data).toHaveProperty('error', 'missing_field')
  })

  it('returns 400 when ids is empty', () => {
    mockAuthenticated()
    const result = batchAcknowledgeMessages('Bearer test-key', [])
    expect(result.status).toBe(400)
  })

  it('returns 400 when ids exceeds 100', () => {
    mockAuthenticated()
    const ids = Array.from({ length: 101 }, (_, i) => `msg-${i}`)
    const result = batchAcknowledgeMessages('Bearer test-key', ids)
    expect(result.status).toBe(400)
    expect(result.data).toHaveProperty('message', 'Maximum 100 messages per batch')
  })

  it('acknowledges a batch of messages', () => {
    mockAuthenticated()
    mockAmpRelay.acknowledgeMessages.mockReturnValue(3)

    const result = batchAcknowledgeMessages('Bearer test-key', ['msg-1', 'msg-2', 'msg-3'])

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ acknowledged: 3 })
    expect(mockAmpRelay.acknowledgeMessages).toHaveBeenCalledWith('agent-1', ['msg-1', 'msg-2', 'msg-3'])
  })
})

// ============================================================================
// GET /api/v1/agents
// ============================================================================

describe('listAMPAgents', () => {
  it('returns 401 without auth', () => {
    mockUnauthenticated()
    const result = listAMPAgents(null)
    expect(result.status).toBe(401)
  })

  it('returns registered agents', () => {
    mockAuthenticated()
    const agent = makeAgent({
      name: 'alice',
      alias: 'Alice Bot',
      metadata: { amp: { address: 'alice@testorg.aimaestro.local', tenant: 'testorg' } },
      sessions: [{ index: 0, status: 'online', createdAt: '', lastActive: '' }],
    })
    mockAgentRegistry.getAMPRegisteredAgents.mockReturnValue([agent])

    const result = listAMPAgents('Bearer test-key')

    expect(result.status).toBe(200)
    expect(result.data.agents).toHaveLength(1)
    expect(result.data.agents[0]).toEqual({
      address: 'alice@testorg.aimaestro.local',
      alias: 'Alice Bot',
      online: true,
    })
    expect(result.data.total).toBe(1)
  })

  it('filters by search term', () => {
    mockAuthenticated()
    const alice = makeAgent({ name: 'alice', metadata: { amp: { address: 'alice@test', tenant: 'testorg' } } })
    const bob = makeAgent({ name: 'bob', metadata: { amp: { address: 'bob@test', tenant: 'testorg' } } })
    mockAgentRegistry.getAMPRegisteredAgents.mockReturnValue([alice, bob])

    const result = listAMPAgents('Bearer test-key', 'bob')

    expect(result.status).toBe(200)
    expect(result.data.agents).toHaveLength(1)
    expect(result.data.total).toBe(1)
  })

  it('filters by tenant', () => {
    mockAuthenticated({ tenantId: 'org-a' })
    const agentA = makeAgent({ name: 'a', metadata: { amp: { address: 'a@test', tenant: 'org-a' } } })
    const agentB = makeAgent({ name: 'b', metadata: { amp: { address: 'b@test', tenant: 'org-b' } } })
    mockAgentRegistry.getAMPRegisteredAgents.mockReturnValue([agentA, agentB])

    const result = listAMPAgents('Bearer test-key')

    expect(result.status).toBe(200)
    expect(result.data.agents).toHaveLength(1)
  })
})

// ============================================================================
// GET /api/v1/agents/me
// ============================================================================

describe('getAgentSelf', () => {
  it('returns 401 without auth', () => {
    mockUnauthenticated()
    const result = getAgentSelf(null)
    expect(result.status).toBe(401)
  })

  it('returns 404 when agent not found', () => {
    mockAuthenticated()
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = getAgentSelf('Bearer test-key')
    expect(result.status).toBe(404)
  })

  it('returns agent self info', () => {
    mockAuthenticated({ address: 'alice@testorg.aimaestro.local' })
    const agent = makeAgent({
      id: 'agent-1',
      alias: 'Alice',
      metadata: { amp: { registeredAt: '2025-01-01T00:00:00.000Z', fingerprint: 'SHA256:abc' } },
    })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAmpKeys.loadKeyPair.mockReturnValue({
      publicPem: 'PUBLIC_KEY',
      privatePem: 'PRIVATE_KEY',
      publicHex: 'abcdef',
      fingerprint: 'SHA256:abc',
    })

    const result = getAgentSelf('Bearer test-key')

    expect(result.status).toBe(200)
    expect(result.data.address).toBe('alice@testorg.aimaestro.local')
    expect(result.data.fingerprint).toBe('SHA256:abc')
    expect(result.data.registered_at).toBe('2025-01-01T00:00:00.000Z')
  })
})

// ============================================================================
// GET /api/v1/agents/me/card
// ============================================================================

describe('getAgentCard', () => {
  it('returns 401 without auth', () => {
    mockUnauthenticated()
    const result = getAgentCard(null)
    expect(result.status).toBe(401)
  })

  it('returns 404 when agent not found', () => {
    mockAuthenticated()
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = getAgentCard('Bearer test-key')
    expect(result.status).toBe(404)
    expect(result.data).toHaveProperty('error', 'not_found')
  })

  it('returns 404 when keypair not found', () => {
    mockAuthenticated()
    mockAgentRegistry.getAgent.mockReturnValue(makeAgent({ id: 'agent-1' }))
    mockAmpKeys.loadKeyPair.mockReturnValue(null)

    const result = getAgentCard('Bearer test-key')
    expect(result.status).toBe(404)
    expect(result.data.message).toContain('keypair')
  })

  it('returns a signed agent card', () => {
    mockAuthenticated({ address: 'alice@testorg.aimaestro.local' })
    const agent = makeAgent({ id: 'agent-1', name: 'alice', alias: 'Alice Bot' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)

    // Generate a real Ed25519 keypair for the test
    const crypto = require('crypto')
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

    mockAmpKeys.loadKeyPair.mockReturnValue({
      publicPem,
      privatePem,
      publicHex: 'abcdef',
      fingerprint: 'SHA256:test-fp',
    })

    const result = getAgentCard('Bearer test-key')

    expect(result.status).toBe(200)
    expect(result.data.address).toBe('alice@testorg.aimaestro.local')
    expect(result.data.name).toBe('alice')
    expect(result.data.alias).toBe('Alice Bot')
    expect(result.data.public_key).toBe(publicPem)
    expect(result.data.fingerprint).toBe('SHA256:test-fp')
    expect(result.data.provider).toBe('testorg.aimaestro.local')
    expect(result.data.capabilities).toContain('messaging')
    expect(result.data.capabilities).toContain('read_receipts')
    expect(result.data.signed_at).toBeDefined()
    expect(result.data.signature).toBeDefined()
    expect(typeof result.data.signature).toBe('string')
    // Verify signature is valid base64
    expect(() => Buffer.from(result.data.signature, 'base64')).not.toThrow()
  })

  it('signature verifies with the public key', () => {
    mockAuthenticated({ address: 'alice@testorg.aimaestro.local' })
    const agent = makeAgent({ id: 'agent-1', name: 'alice' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)

    const crypto = require('crypto')
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

    mockAmpKeys.loadKeyPair.mockReturnValue({
      publicPem,
      privatePem,
      publicHex: 'abcdef',
      fingerprint: 'SHA256:test-fp',
    })

    const result = getAgentCard('Bearer test-key')
    expect(result.status).toBe(200)

    // Verify the signature
    const signable = `${result.data.address}|${result.data.public_key}|${result.data.signed_at}`
    const verified = crypto.verify(
      null,
      Buffer.from(signable),
      publicKey,
      Buffer.from(result.data.signature, 'base64')
    )
    expect(verified).toBe(true)
  })

  it('uses agent address from auth when available', () => {
    mockAuthenticated({ address: 'custom-addr@provider.com' })
    mockAgentRegistry.getAgent.mockReturnValue(makeAgent({ id: 'agent-1', name: 'alice' }))

    const crypto = require('crypto')
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    mockAmpKeys.loadKeyPair.mockReturnValue({
      publicPem: publicKey.export({ type: 'spki', format: 'pem' }),
      privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      publicHex: 'abcdef',
      fingerprint: 'SHA256:fp',
    })

    const result = getAgentCard('Bearer test-key')
    expect(result.data.address).toBe('custom-addr@provider.com')
  })
})

// ============================================================================
// PATCH /api/v1/agents/me
// ============================================================================

describe('updateAgentSelf', () => {
  it('returns 401 without auth', async () => {
    mockUnauthenticated()
    const result = await updateAgentSelf(null, {})
    expect(result.status).toBe(401)
  })

  it('returns 404 when agent not found', async () => {
    mockAuthenticated()
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = await updateAgentSelf('Bearer test-key', { alias: 'New Alias' })
    expect(result.status).toBe(404)
  })

  it('updates agent alias', async () => {
    mockAuthenticated()
    const agent = makeAgent({ id: 'agent-1', metadata: {} })
    mockAgentRegistry.getAgent.mockReturnValue(agent)

    const result = await updateAgentSelf('Bearer test-key', { alias: 'New Alias' })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('updated', true)
    expect(mockAgentRegistry.updateAgent).toHaveBeenCalledWith('agent-1', expect.objectContaining({ label: 'New Alias' }))
  })

  it('does not call updateAgent when no fields change', async () => {
    mockAuthenticated()
    mockAgentRegistry.getAgent.mockReturnValue(makeAgent({ id: 'agent-1' }))

    await updateAgentSelf('Bearer test-key', {})

    expect(mockAgentRegistry.updateAgent).not.toHaveBeenCalled()
  })
})

// ============================================================================
// DELETE /api/v1/agents/me
// ============================================================================

describe('deleteAgentSelf', () => {
  it('returns 401 without auth', async () => {
    mockUnauthenticated()
    const result = await deleteAgentSelf(null)
    expect(result.status).toBe(401)
  })

  it('returns 404 when agent not found', async () => {
    mockAuthenticated()
    mockAgentRegistry.deleteAgent.mockReturnValue(false)

    const result = await deleteAgentSelf('Bearer test-key')
    expect(result.status).toBe(404)
  })

  it('deletes agent and revokes keys', async () => {
    mockAuthenticated({ address: 'alice@test' })
    mockAgentRegistry.deleteAgent.mockReturnValue(true)

    const result = await deleteAgentSelf('Bearer test-key')

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('deregistered', true)
    expect(result.data).toHaveProperty('address', 'alice@test')
    expect(mockAmpAuth.revokeAllKeysForAgent).toHaveBeenCalledWith('agent-1')
    expect(mockAgentRegistry.deleteAgent).toHaveBeenCalledWith('agent-1', true)
  })
})

// ============================================================================
// GET /api/v1/agents/resolve/:address
// ============================================================================

describe('resolveAgentAddress', () => {
  it('returns 401 without auth', () => {
    mockUnauthenticated()
    const result = resolveAgentAddress(null, 'alice@test')
    expect(result.status).toBe(401)
  })

  it('resolves an agent by name', () => {
    mockAuthenticated()
    const agent = makeAgent({
      id: 'agent-1',
      name: 'alice',
      alias: 'Alice Bot',
      metadata: { amp: { address: 'alice@testorg.aimaestro.local', fingerprint: 'SHA256:old' } },
      sessions: [{ index: 0, status: 'online', createdAt: '', lastActive: '' }],
    })
    mockAgentRegistry.getAgentByNameAnyHost.mockReturnValue(agent)
    mockAmpKeys.loadKeyPair.mockReturnValue({
      publicPem: 'PUB_KEY_PEM',
      privatePem: 'PRIV',
      publicHex: 'hex',
      fingerprint: 'SHA256:abc',
    })

    const result = resolveAgentAddress('Bearer key', 'alice@testorg.aimaestro.local')

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('address', 'alice@testorg.aimaestro.local')
    expect(result.data).toHaveProperty('public_key', 'PUB_KEY_PEM')
    expect(result.data).toHaveProperty('fingerprint', 'SHA256:abc')
    expect(result.data).toHaveProperty('online', true)
    expect(result.data).toHaveProperty('key_algorithm', 'Ed25519')
  })

  it('returns 404 when agent not found', () => {
    mockAuthenticated()
    mockAgentRegistry.getAgentByNameAnyHost.mockReturnValue(null)
    mockAgentRegistry.loadAgents.mockReturnValue([])

    const result = resolveAgentAddress('Bearer key', 'nobody@test')

    expect(result.status).toBe(404)
    expect(result.data).toHaveProperty('error', 'not_found')
  })

  it('falls back to address-based lookup', () => {
    mockAuthenticated()
    mockAgentRegistry.getAgentByNameAnyHost.mockReturnValue(null)
    const agent = makeAgent({
      id: 'agent-2',
      name: 'bob',
      alias: 'Bob',
      metadata: { amp: { address: 'bob@custom.domain' } },
    })
    mockAgentRegistry.loadAgents.mockReturnValue([agent])
    mockAmpKeys.loadKeyPair.mockReturnValue({
      publicPem: 'BOB_KEY',
      privatePem: 'PRIV',
      publicHex: 'hex',
      fingerprint: 'SHA256:bob-fp',
    })

    const result = resolveAgentAddress('Bearer key', 'bob@custom.domain')

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('address', 'bob@custom.domain')
    expect(result.data).toHaveProperty('fingerprint', 'SHA256:bob-fp')
  })
})

// ============================================================================
// DELETE /api/v1/auth/revoke-key
// ============================================================================

describe('revokeKey', () => {
  it('returns 401 without auth header', () => {
    mockAmpAuth.extractApiKeyFromHeader.mockReturnValue(null)
    const result = revokeKey(null)
    expect(result.status).toBe(401)
  })

  it('returns 404 when key not found', () => {
    mockAmpAuth.extractApiKeyFromHeader.mockReturnValue('amp_live_sk_test')
    mockAmpAuth.revokeApiKey.mockReturnValue(false)

    const result = revokeKey('Bearer amp_live_sk_test')
    expect(result.status).toBe(404)
  })

  it('revokes a valid key', () => {
    mockAmpAuth.extractApiKeyFromHeader.mockReturnValue('amp_live_sk_test')
    mockAmpAuth.revokeApiKey.mockReturnValue(true)

    const result = revokeKey('Bearer amp_live_sk_test')

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('revoked', true)
    expect(result.data).toHaveProperty('revoked_at')
  })
})

// ============================================================================
// POST /api/v1/auth/rotate-key
// ============================================================================

describe('rotateKey', () => {
  it('returns 401 without auth header', () => {
    mockAmpAuth.extractApiKeyFromHeader.mockReturnValue(null)
    const result = rotateKey(null)
    expect(result.status).toBe(401)
  })

  it('returns 401 for invalid key', () => {
    mockAmpAuth.extractApiKeyFromHeader.mockReturnValue('amp_live_sk_bad')
    mockAmpAuth.rotateApiKey.mockReturnValue(null)

    const result = rotateKey('Bearer amp_live_sk_bad')
    expect(result.status).toBe(401)
  })

  it('rotates a valid key', () => {
    mockAmpAuth.extractApiKeyFromHeader.mockReturnValue('amp_live_sk_old')
    mockAmpAuth.rotateApiKey.mockReturnValue({
      api_key: 'amp_live_sk_new',
      previous_key_revoked: true,
    })

    const result = rotateKey('Bearer amp_live_sk_old')

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('api_key', 'amp_live_sk_new')
  })
})

// ============================================================================
// POST /api/v1/auth/rotate-keys (keypair)
// ============================================================================

describe('rotateKeypair', () => {
  it('returns 401 without auth', async () => {
    mockUnauthenticated()
    const result = await rotateKeypair(null, null)
    expect(result.status).toBe(401)
  })

  it('returns 404 when agent not found', async () => {
    mockAuthenticated()
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = await rotateKeypair(null, 'Bearer test-key')
    expect(result.status).toBe(404)
  })

  it('generates new keypair (no body — backward compat)', async () => {
    mockAuthenticated({ address: 'alice@test' })
    const agent = makeAgent({ id: 'agent-1', metadata: { amp: { fingerprint: 'SHA256:old' } } })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAmpKeys.generateKeyPair.mockResolvedValue({
      publicPem: 'NEW_PUB',
      privatePem: 'NEW_PRIV',
      publicHex: 'newhex',
      fingerprint: 'SHA256:new-fp',
    })

    const result = await rotateKeypair(null, 'Bearer test-key')

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('rotated', true)
    expect(result.data).toHaveProperty('fingerprint', 'SHA256:new-fp')
    expect(result.data).toHaveProperty('public_key', 'NEW_PUB')
    expect(result.data).toHaveProperty('key_algorithm', 'Ed25519')
    expect(mockAmpKeys.saveKeyPair).toHaveBeenCalledWith('agent-1', expect.objectContaining({ fingerprint: 'SHA256:new-fp' }))
    expect(mockAgentRegistry.updateAgent).toHaveBeenCalled()
  })

  it('rotates with valid proof-of-possession', async () => {
    mockAuthenticated({ agentId: 'agent-1', address: 'alice@test' })
    const agent = makeAgent({ id: 'agent-1', metadata: { amp: { fingerprint: 'SHA256:old' } } })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAmpKeys.loadKeyPair.mockReturnValue({ publicHex: 'oldhex', privatePem: 'OLD_PRIV', publicPem: 'OLD_PUB', fingerprint: 'SHA256:old' })
    mockAmpKeys.verifySignature.mockReturnValue(true)
    mockAmpKeys.calculateFingerprint.mockReturnValue('SHA256:new-pop-fp')

    const body = { new_public_key: TEST_ED25519_PEM, key_algorithm: 'Ed25519' as const, proof: 'base64proof' }
    const result = await rotateKeypair(body, 'Bearer test-key')

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('rotated', true)
    expect(result.data).toHaveProperty('fingerprint', 'SHA256:new-pop-fp')
    expect(mockAmpKeys.verifySignature).toHaveBeenCalled()
    expect(mockAmpKeys.saveKeyPair).toHaveBeenCalledWith('agent-1', expect.objectContaining({ fingerprint: 'SHA256:new-pop-fp' }))
  })

  it('returns 401 for invalid proof signature', async () => {
    mockAuthenticated({ agentId: 'agent-1' })
    const agent = makeAgent({ id: 'agent-1', metadata: { amp: { fingerprint: 'SHA256:old' } } })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAmpKeys.loadKeyPair.mockReturnValue({ publicHex: 'oldhex', privatePem: 'OLD_PRIV', publicPem: 'OLD_PUB', fingerprint: 'SHA256:old' })
    mockAmpKeys.verifySignature.mockReturnValue(false)

    const body = { new_public_key: TEST_ED25519_PEM, key_algorithm: 'Ed25519' as const, proof: 'bad-proof' }
    const result = await rotateKeypair(body, 'Bearer test-key')

    expect(result.status).toBe(401)
    expect(result.data).toHaveProperty('error', 'invalid_signature')
  })

  it('returns 400 when proof provided without new_public_key', async () => {
    mockAuthenticated({ agentId: 'agent-1' })
    const agent = makeAgent({ id: 'agent-1', metadata: { amp: {} } })
    mockAgentRegistry.getAgent.mockReturnValue(agent)

    const body = { proof: 'base64proof' } as any
    const result = await rotateKeypair(body, 'Bearer test-key')

    expect(result.status).toBe(400)
    expect(result.data).toHaveProperty('error', 'missing_field')
  })

  it('returns 400 when new_public_key provided without proof', async () => {
    mockAuthenticated({ agentId: 'agent-1' })
    const agent = makeAgent({ id: 'agent-1', metadata: { amp: {} } })
    mockAgentRegistry.getAgent.mockReturnValue(agent)

    const body = { new_public_key: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----' } as any
    const result = await rotateKeypair(body, 'Bearer test-key')

    expect(result.status).toBe(400)
    expect(result.data).toHaveProperty('error', 'missing_field')
  })
})

// ============================================================================
// POST /api/v1/register — duplicate key rejection
// ============================================================================

describe('registerAgent — duplicate key rejection', () => {
  const validRegBody = {
    tenant: 'testorg',
    name: 'new-agent',
    public_key: TEST_ED25519_PEM,
    key_algorithm: 'Ed25519' as const,
  }

  /** Set up mocks needed for registerAgent to reach the duplicate-key check */
  function setupRegisterMocks() {
    mockAmpKeys.calculateFingerprint.mockReturnValue('SHA256:test-fingerprint')
    mockHostsConfig.getSelfHost.mockReturnValue({ id: 'test-host', name: 'Test Host', url: 'http://localhost:23000' })
    mockHostsConfig.getSelfHostId.mockReturnValue('test-host')
    mockHostsConfig.getOrganization.mockReturnValue('testorg')
  }

  it('rejects registration when fingerprint already used by different agent', async () => {
    setupRegisterMocks()
    const existingAgent = makeAgent({ name: 'other-agent', metadata: { amp: { fingerprint: 'SHA256:test-fingerprint', registeredVia: 'local' } } })
    mockAgentRegistry.getAMPRegisteredAgents.mockReturnValue([existingAgent])
    mockAgentRegistry.getAgentByName.mockReturnValue(null)

    const result = await registerAgent(validRegBody, null)

    expect(result.status).toBe(409)
    expect(result.data).toHaveProperty('error', 'key_already_registered')
    expect((result.data as any).details).toHaveProperty('fingerprint')
    // Must NOT reveal the other agent's name (info leakage prevention)
    expect(JSON.stringify(result.data)).not.toContain('other-agent')
  })

  it('allows same agent re-registering with same key', async () => {
    setupRegisterMocks()
    const existingAgent = makeAgent({ name: 'new-agent', metadata: { amp: { fingerprint: 'SHA256:test-fingerprint', registeredVia: 'local' } } })
    mockAgentRegistry.getAMPRegisteredAgents.mockReturnValue([existingAgent])
    mockAgentRegistry.getAgentByName.mockReturnValue(existingAgent)
    mockAmpAuth.createApiKey.mockReturnValue({ key: 'api-key-123', hash: 'hash-123' })

    const result = await registerAgent(validRegBody, null)

    // Should succeed (re-registration), not 409
    expect(result.status).not.toBe(409)
  })

  it('allows registration with unique fingerprint', async () => {
    setupRegisterMocks()
    mockAgentRegistry.getAMPRegisteredAgents.mockReturnValue([])
    mockAgentRegistry.getAgentByName.mockReturnValue(null)
    mockAgentRegistry.createAgent.mockImplementation((data: any) => ({ ...data, id: 'new-id' }))
    mockAmpAuth.createApiKey.mockReturnValue({ key: 'api-key-123', hash: 'hash-123' })

    const result = await registerAgent(validRegBody, null)

    expect(result.status).not.toBe(409)
  })
})

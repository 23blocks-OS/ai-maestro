/**
 * Shared mock factories for service-level tests.
 *
 * Each factory returns a mock object whose methods are vi.fn() stubs.
 * Tests call vi.mock() at module scope, then configure individual stubs
 * inside beforeEach / individual test cases.
 *
 * Key principle: Service tests mock lib/ imports, NOT the filesystem.
 * Lib modules (agent-registry, team-registry, etc.) already have their
 * own tests covering file I/O.
 */

import { vi } from 'vitest'

// ---------------------------------------------------------------------------
// AgentRuntime mock
// ---------------------------------------------------------------------------

export function createRuntimeMock() {
  return {
    listSessions: vi.fn().mockResolvedValue([]),
    sessionExists: vi.fn().mockResolvedValue(false),
    createSession: vi.fn().mockResolvedValue(undefined),
    killSession: vi.fn().mockResolvedValue(undefined),
    renameSession: vi.fn().mockResolvedValue(undefined),
    sendKeys: vi.fn().mockResolvedValue(undefined),
    cancelCopyMode: vi.fn().mockResolvedValue(undefined),
    setEnvironment: vi.fn().mockResolvedValue(undefined),
    unsetEnvironment: vi.fn().mockResolvedValue(undefined),
  }
}

// ---------------------------------------------------------------------------
// Hosts config mock
// ---------------------------------------------------------------------------

export function createHostsConfigMock() {
  return {
    getSelfHost: vi.fn().mockReturnValue({ id: 'test-host', name: 'Test Host', url: 'http://localhost:23000' }),
    getSelfHostId: vi.fn().mockReturnValue('test-host'),
    isSelf: vi.fn().mockReturnValue(true),
    getHosts: vi.fn().mockReturnValue([{ id: 'test-host', name: 'Test Host', url: 'http://localhost:23000' }]),
    getHostById: vi.fn().mockReturnValue(null),
  }
}

// ---------------------------------------------------------------------------
// Shared state mock
// ---------------------------------------------------------------------------

export function createSharedStateMock() {
  const sessionActivity = new Map<string, number>()
  return {
    sessionActivity,
    broadcastStatusUpdate: vi.fn(),
    statusSubscribers: new Set(),
    terminalSessions: new Map(),
    companionClients: new Map(),
  }
}

// ---------------------------------------------------------------------------
// child_process mock
// ---------------------------------------------------------------------------

export function createChildProcessMock() {
  return {
    exec: vi.fn(),
    execSync: vi.fn(),
  }
}

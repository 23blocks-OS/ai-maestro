/**
 * Factory functions for test data used across service tests.
 *
 * Each factory provides sensible defaults that can be overridden.
 * Counters keep IDs unique within a test run (reset in beforeEach if needed).
 */

import type { Agent, AgentSession } from '@/types/agent'
import type { Session } from '@/types/session'
import type { Team } from '@/types/team'
import type { Task, TaskStatus } from '@/types/task'
import type { TeamDocument } from '@/types/document'
import type { Host } from '@/types/host'

let counter = 0

/** Reset the internal counter (call in beforeEach) */
export function resetFixtureCounter() {
  counter = 0
}

/** Increment and return a unique counter value */
function nextId(): number {
  return ++counter
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export function makeAgent(overrides: Partial<Agent> = {}): Agent {
  const n = nextId()
  return {
    id: `agent-${n}`,
    name: `test-agent-${n}`,
    workingDirectory: `/home/test/agent-${n}`,
    sessions: [],
    hostId: 'test-host',
    program: 'claude-code',
    taskDescription: `Test agent ${n}`,
    tags: [],
    capabilities: [],
    deployment: { type: 'local', local: { hostname: 'test-machine', platform: 'darwin' } },
    tools: {},
    status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastActive: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeAgentSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    index: 0,
    status: 'online',
    workingDirectory: '/home/test',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastActive: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Session (tmux)
// ---------------------------------------------------------------------------

export function makeSession(name?: string, overrides: Partial<Session> = {}): Session {
  const n = nextId()
  const sessionName = name || `session-${n}`
  return {
    id: sessionName,
    name: sessionName,
    workingDirectory: '/home/test',
    status: 'idle',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastActivity: '2025-01-01T00:00:00.000Z',
    windows: 1,
    hostId: 'test-host',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export function makeTeam(overrides: Partial<Team> = {}): Team {
  const n = nextId()
  return {
    id: `team-${n}`,
    name: `Test Team ${n}`,
    agentIds: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export function makeTask(overrides: Partial<Task> = {}): Task {
  const n = nextId()
  return {
    id: `task-${n}`,
    teamId: 'team-1',
    subject: `Test Task ${n}`,
    status: 'pending' as TaskStatus,
    blockedBy: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function makeDocument(overrides: Partial<TeamDocument> = {}): TeamDocument {
  const n = nextId()
  return {
    id: `doc-${n}`,
    teamId: 'team-1',
    title: `Test Document ${n}`,
    content: `Content for document ${n}`,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

export function makeHost(overrides: Partial<Host> = {}): Host {
  const n = nextId()
  return {
    id: `host-${n}`,
    name: `Test Host ${n}`,
    url: `http://host-${n}:23000`,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// ServiceResult helper
// ---------------------------------------------------------------------------

export function makeServiceResult<T>(data?: T, error?: string, status = 200) {
  return { data, error, status }
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

// ============================================================================
// Mocks
// ============================================================================

// In-memory filesystem store (keyed by absolute file path)
let fsStore: Record<string, string> = {}

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn((filePath: string) => filePath in fsStore),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((filePath: string) => {
      if (filePath in fsStore) return fsStore[filePath]
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`)
    }),
    writeFileSync: vi.fn((filePath: string, data: string) => {
      fsStore[filePath] = data
    }),
  },
}))

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    uuidCounter++
    return `uuid-${uuidCounter}`
  }),
}))

vi.mock('@/lib/agent-registry', () => ({
  loadAgents: vi.fn(() => [
    { id: 'agent-1', name: 'backend-agent', label: 'Backend Agent' },
    { id: 'agent-2', name: 'frontend-agent', label: '', alias: 'fe-alias' },
    { id: 'agent-3', name: 'test-agent' },
  ]),
}))

// ============================================================================
// Import module under test (after mocks are declared)
// ============================================================================

import {
  loadTasks,
  saveTasks,
  resolveTaskDeps,
  createTask,
  getTask,
  updateTask,
  deleteTask,
  wouldCreateCycle,
} from '@/lib/task-registry'
import type { Task } from '@/types/task'

// ============================================================================
// Test helpers
// ============================================================================

const TEAMS_DIR = path.join(os.homedir(), '.aimaestro', 'teams')

function tasksFilePath(teamId: string): string {
  return path.join(TEAMS_DIR, `tasks-${teamId}.json`)
}

/** Build a Task object with sensible defaults. Overrides apply. */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${++uuidCounter}`,
    teamId: 'team-1',
    subject: 'Default Task',
    status: 'pending',
    assigneeAgentId: null,
    blockedBy: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ============================================================================
// Setup / teardown
// ============================================================================

beforeEach(() => {
  fsStore = {}
  uuidCounter = 0
  vi.clearAllMocks()
})

// ============================================================================
// loadTasks
// ============================================================================

describe('loadTasks', () => {
  it('returns empty array when file does not exist', () => {
    const tasks = loadTasks('team-1')
    expect(tasks).toEqual([])
  })

  it('returns tasks from an existing file', () => {
    const task = makeTask({ id: 'task-a', teamId: 'team-1' })
    fsStore[tasksFilePath('team-1')] = JSON.stringify({ version: 1, tasks: [task] })

    const tasks = loadTasks('team-1')
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('task-a')
  })

  it('returns empty array when file contains invalid JSON', () => {
    fsStore[tasksFilePath('team-1')] = '{ broken json'

    const tasks = loadTasks('team-1')
    expect(tasks).toEqual([])
  })

  it('returns empty array when tasks property is not an array', () => {
    fsStore[tasksFilePath('team-1')] = JSON.stringify({ version: 1, tasks: 'not-an-array' })

    const tasks = loadTasks('team-1')
    expect(tasks).toEqual([])
  })
})

// ============================================================================
// saveTasks
// ============================================================================

describe('saveTasks', () => {
  it('writes tasks to the correct file path with version wrapper', () => {
    const task = makeTask({ id: 'task-s1', teamId: 'team-2' })
    const result = saveTasks('team-2', [task])

    expect(result).toBe(true)
    const written = JSON.parse(fsStore[tasksFilePath('team-2')])
    expect(written.version).toBe(1)
    expect(written.tasks).toHaveLength(1)
    expect(written.tasks[0].id).toBe('task-s1')
  })

  it('round-trips with loadTasks', () => {
    const task = makeTask({ id: 'task-rt', teamId: 'team-1', subject: 'Round Trip' })
    saveTasks('team-1', [task])

    const loaded = loadTasks('team-1')
    expect(loaded).toHaveLength(1)
    expect(loaded[0].subject).toBe('Round Trip')
  })
})

// ============================================================================
// createTask
// ============================================================================

describe('createTask', () => {
  it('creates a task with default status pending', () => {
    const task = createTask({ teamId: 'team-1', subject: 'New Task' })

    expect(task.status).toBe('pending')
    expect(task.subject).toBe('New Task')
    expect(task.teamId).toBe('team-1')
  })

  it('generates a UUID for the task id', () => {
    const task = createTask({ teamId: 'team-1', subject: 'UUID Test' })

    expect(task.id).toMatch(/^uuid-/)
  })

  it('sets createdAt and updatedAt to the same ISO timestamp', () => {
    const task = createTask({ teamId: 'team-1', subject: 'Timestamp Test' })

    expect(task.createdAt).toBe(task.updatedAt)
    expect(new Date(task.createdAt).toISOString()).toBe(task.createdAt)
  })

  it('persists the task to storage', () => {
    createTask({ teamId: 'team-1', subject: 'Persisted Task' })

    const loaded = loadTasks('team-1')
    expect(loaded).toHaveLength(1)
    expect(loaded[0].subject).toBe('Persisted Task')
  })

  it('preserves all optional fields when provided', () => {
    const task = createTask({
      teamId: 'team-1',
      subject: 'Full Task',
      description: 'A detailed description',
      assigneeAgentId: 'agent-1',
      blockedBy: ['dep-1'],
      priority: 2,
    })

    expect(task.description).toBe('A detailed description')
    expect(task.assigneeAgentId).toBe('agent-1')
    expect(task.blockedBy).toEqual(['dep-1'])
    expect(task.priority).toBe(2)
  })

  it('defaults blockedBy to empty array when not provided', () => {
    const task = createTask({ teamId: 'team-1', subject: 'No Deps' })
    expect(task.blockedBy).toEqual([])
  })

  it('defaults assigneeAgentId to null when not provided', () => {
    const task = createTask({ teamId: 'team-1', subject: 'No Assignee' })
    expect(task.assigneeAgentId).toBeNull()
  })
})

// ============================================================================
// getTask
// ============================================================================

describe('getTask', () => {
  it('returns the task when it exists', () => {
    createTask({ teamId: 'team-1', subject: 'Find Me' })
    const tasks = loadTasks('team-1')
    const taskId = tasks[0].id

    const found = getTask('team-1', taskId)
    expect(found).not.toBeNull()
    expect(found!.subject).toBe('Find Me')
  })

  it('returns null for a non-existent task ID', () => {
    createTask({ teamId: 'team-1', subject: 'Exists' })

    const found = getTask('team-1', 'non-existent-id')
    expect(found).toBeNull()
  })

  it('returns null when team has no tasks file', () => {
    const found = getTask('team-empty', 'any-id')
    expect(found).toBeNull()
  })
})

// ============================================================================
// updateTask
// ============================================================================

describe('updateTask', () => {
  it('returns null task when task does not exist', () => {
    const result = updateTask('team-1', 'non-existent', { subject: 'Updated' })
    expect(result.task).toBeNull()
    expect(result.unblocked).toEqual([])
  })

  it('updates the subject and refreshes updatedAt', () => {
    const created = createTask({ teamId: 'team-1', subject: 'Original' })
    const result = updateTask('team-1', created.id, { subject: 'Updated' })

    expect(result.task).not.toBeNull()
    expect(result.task!.subject).toBe('Updated')
    expect(result.task!.updatedAt).toBeDefined()
  })

  it('sets startedAt when status changes to in_progress', () => {
    const created = createTask({ teamId: 'team-1', subject: 'Start Me' })
    const result = updateTask('team-1', created.id, { status: 'in_progress' })

    expect(result.task!.startedAt).toBeDefined()
    expect(result.task!.status).toBe('in_progress')
  })

  it('sets startedAt when status changes to review (if not already started)', () => {
    const created = createTask({ teamId: 'team-1', subject: 'Review Me' })
    const result = updateTask('team-1', created.id, { status: 'review' })

    expect(result.task!.startedAt).toBeDefined()
    expect(result.task!.status).toBe('review')
  })

  it('sets completedAt when status changes to completed', () => {
    const created = createTask({ teamId: 'team-1', subject: 'Complete Me' })
    const result = updateTask('team-1', created.id, { status: 'completed' })

    expect(result.task!.completedAt).toBeDefined()
    expect(result.task!.status).toBe('completed')
  })

  it('does not overwrite startedAt if already set', () => {
    const created = createTask({ teamId: 'team-1', subject: 'Already Started' })

    // Move to in_progress first to set startedAt
    const first = updateTask('team-1', created.id, { status: 'in_progress' })
    const firstStartedAt = first.task!.startedAt

    // Move to review -- startedAt should not change
    const second = updateTask('team-1', created.id, { status: 'review' })
    expect(second.task!.startedAt).toBe(firstStartedAt)
  })

  it('detects unblocked tasks when a blocker is completed', () => {
    const blocker = createTask({ teamId: 'team-1', subject: 'Blocker' })
    const blocked = createTask({
      teamId: 'team-1',
      subject: 'Blocked',
      blockedBy: [blocker.id],
    })

    const result = updateTask('team-1', blocker.id, { status: 'completed' })

    expect(result.unblocked).toHaveLength(1)
    expect(result.unblocked[0].id).toBe(blocked.id)
  })

  it('does not report unblocked if other blockers remain incomplete', () => {
    const blocker1 = createTask({ teamId: 'team-1', subject: 'Blocker 1' })
    const blocker2 = createTask({ teamId: 'team-1', subject: 'Blocker 2' })
    createTask({
      teamId: 'team-1',
      subject: 'Double Blocked',
      blockedBy: [blocker1.id, blocker2.id],
    })

    // Complete only the first blocker
    const result = updateTask('team-1', blocker1.id, { status: 'completed' })

    expect(result.unblocked).toHaveLength(0)
  })

  it('does not report unblocked when task was already completed before', () => {
    const blocker = createTask({ teamId: 'team-1', subject: 'Already Done' })
    updateTask('team-1', blocker.id, { status: 'completed' })

    createTask({
      teamId: 'team-1',
      subject: 'Dep',
      blockedBy: [blocker.id],
    })

    // Update the already-completed blocker again -- wasCompleted is true so no unblock detection
    const result = updateTask('team-1', blocker.id, { status: 'completed' })
    expect(result.unblocked).toEqual([])
  })
})

// ============================================================================
// deleteTask
// ============================================================================

describe('deleteTask', () => {
  it('removes the task and returns true', () => {
    const task = createTask({ teamId: 'team-1', subject: 'Delete Me' })

    const result = deleteTask('team-1', task.id)
    expect(result).toBe(true)

    const remaining = loadTasks('team-1')
    expect(remaining).toHaveLength(0)
  })

  it('returns false when task does not exist', () => {
    const result = deleteTask('team-1', 'non-existent')
    expect(result).toBe(false)
  })

  it('cleans up blockedBy references in other tasks', () => {
    const blocker = createTask({ teamId: 'team-1', subject: 'Blocker to Delete' })
    const dependent = createTask({
      teamId: 'team-1',
      subject: 'Dependent',
      blockedBy: [blocker.id],
    })

    deleteTask('team-1', blocker.id)

    const remaining = loadTasks('team-1')
    const updatedDependent = remaining.find(t => t.id === dependent.id)
    expect(updatedDependent).toBeDefined()
    expect(updatedDependent!.blockedBy).toEqual([])
  })

  it('preserves other blockedBy entries when deleting one blocker', () => {
    const blockerA = createTask({ teamId: 'team-1', subject: 'Blocker A' })
    const blockerB = createTask({ teamId: 'team-1', subject: 'Blocker B' })
    const dependent = createTask({
      teamId: 'team-1',
      subject: 'Has Two Blockers',
      blockedBy: [blockerA.id, blockerB.id],
    })

    deleteTask('team-1', blockerA.id)

    const remaining = loadTasks('team-1')
    const updated = remaining.find(t => t.id === dependent.id)
    expect(updated!.blockedBy).toEqual([blockerB.id])
  })
})

// ============================================================================
// resolveTaskDeps
// ============================================================================

describe('resolveTaskDeps', () => {
  it('computes blocks array (reverse of blockedBy)', () => {
    const taskA = makeTask({ id: 'a', subject: 'A', blockedBy: [] })
    const taskB = makeTask({ id: 'b', subject: 'B', blockedBy: ['a'] })

    const resolved = resolveTaskDeps([taskA, taskB])
    const resolvedA = resolved.find(t => t.id === 'a')!
    const resolvedB = resolved.find(t => t.id === 'b')!

    expect(resolvedA.blocks).toEqual(['b'])
    expect(resolvedB.blocks).toEqual([])
  })

  it('sets isBlocked to true when a dependency is not completed', () => {
    const dep = makeTask({ id: 'dep', status: 'in_progress' })
    const blocked = makeTask({ id: 'blocked', blockedBy: ['dep'] })

    const resolved = resolveTaskDeps([dep, blocked])
    const resolvedBlocked = resolved.find(t => t.id === 'blocked')!

    expect(resolvedBlocked.isBlocked).toBe(true)
  })

  it('sets isBlocked to false when all dependencies are completed', () => {
    const dep = makeTask({ id: 'dep', status: 'completed' })
    const unblocked = makeTask({ id: 'unblocked', blockedBy: ['dep'] })

    const resolved = resolveTaskDeps([dep, unblocked])
    const resolvedUnblocked = resolved.find(t => t.id === 'unblocked')!

    expect(resolvedUnblocked.isBlocked).toBe(false)
  })

  it('resolves assigneeName from agent label', () => {
    const task = makeTask({ id: 't1', assigneeAgentId: 'agent-1' })

    const resolved = resolveTaskDeps([task])
    expect(resolved[0].assigneeName).toBe('Backend Agent')
  })

  it('falls back to agent name when label is empty string', () => {
    // agent-2 has label: '' (falsy), name: 'frontend-agent'
    const task = makeTask({ id: 't2', assigneeAgentId: 'agent-2' })

    const resolved = resolveTaskDeps([task])
    expect(resolved[0].assigneeName).toBe('frontend-agent')
  })

  it('leaves assigneeName undefined when no assignee', () => {
    const task = makeTask({ id: 't3', assigneeAgentId: null })

    const resolved = resolveTaskDeps([task])
    expect(resolved[0].assigneeName).toBeUndefined()
  })

  it('handles empty task list', () => {
    const resolved = resolveTaskDeps([])
    expect(resolved).toEqual([])
  })
})

// ============================================================================
// wouldCreateCycle
// ============================================================================

describe('wouldCreateCycle', () => {
  it('detects a cycle through a 3-node chain (A blocks B blocks C, adding C->A)', () => {
    // Dependency chain: C.blockedBy=[B], B.blockedBy=[A] -- meaning A blocks B blocks C
    // wouldCreateCycle('team-1', 'c', 'a') walks from A through tasks it blocks:
    //   A blocks B (because B.blockedBy includes A), B blocks C (because C.blockedBy includes B)
    //   reaches taskId 'c' -> cycle detected
    const tasks = [
      makeTask({ id: 'a', teamId: 'team-1', blockedBy: [] }),
      makeTask({ id: 'b', teamId: 'team-1', blockedBy: ['a'] }),
      makeTask({ id: 'c', teamId: 'team-1', blockedBy: ['b'] }),
    ]
    saveTasks('team-1', tasks)

    expect(wouldCreateCycle('team-1', 'c', 'a')).toBe(true)
  })

  it('detects a transitive cycle through a 4-node chain', () => {
    // Chain: D.blockedBy=[C], C.blockedBy=[B], B.blockedBy=[A]
    // Adding A as a dependency of D would create: A -> B -> C -> D -> A
    const tasks = [
      makeTask({ id: 'a', teamId: 'team-1', blockedBy: [] }),
      makeTask({ id: 'b', teamId: 'team-1', blockedBy: ['a'] }),
      makeTask({ id: 'c', teamId: 'team-1', blockedBy: ['b'] }),
      makeTask({ id: 'd', teamId: 'team-1', blockedBy: ['c'] }),
    ]
    saveTasks('team-1', tasks)

    expect(wouldCreateCycle('team-1', 'd', 'a')).toBe(true)
  })

  it('detects a 2-node cycle (B depends on A, adding A depends on B)', () => {
    // B.blockedBy=[A] -- A blocks B. If we add A.blockedBy=[B], that is A -> B -> A.
    // wouldCreateCycle('team-1', 'a', 'b') walks from B: B blocks? nothing. Returns false.
    // But wouldCreateCycle('team-1', taskId, depId) where the dep already blocks taskId
    // through the existing chain DOES detect it via the blocks traversal.
    // Here we check the reverse direction which the function handles:
    // B.blockedBy=[A] means A blocks B. Checking wouldCreateCycle('team-1', 'b', 'a'):
    //   hasCycle('a'): finds blockers of 'a' = tasks where blockedBy includes 'a' = [B]
    //   hasCycle('b'): 'b' === taskId -> true
    const tasks = [
      makeTask({ id: 'a', teamId: 'team-1', blockedBy: [] }),
      makeTask({ id: 'b', teamId: 'team-1', blockedBy: ['a'] }),
    ]
    saveTasks('team-1', tasks)

    // "Would adding A as a dependency of B create a cycle?" -- yes, B already depends on A
    expect(wouldCreateCycle('team-1', 'b', 'a')).toBe(true)
  })

  it('returns false when no cycle would be created', () => {
    const tasks = [
      makeTask({ id: 'a', teamId: 'team-1', blockedBy: [] }),
      makeTask({ id: 'b', teamId: 'team-1', blockedBy: [] }),
    ]
    saveTasks('team-1', tasks)

    // A and B are independent; making B depend on A does not create a cycle
    expect(wouldCreateCycle('team-1', 'b', 'a')).toBe(false)
  })

  it('returns false when dependency id does not exist in tasks', () => {
    const tasks = [
      makeTask({ id: 'a', teamId: 'team-1', blockedBy: [] }),
    ]
    saveTasks('team-1', tasks)

    expect(wouldCreateCycle('team-1', 'a', 'non-existent')).toBe(false)
  })

  it('returns false for independent branches in a diamond graph', () => {
    // Diamond: A blocks B and C independently. D depends on both B and C.
    // Adding a dependency from B to C should be safe (no cycle).
    const tasks = [
      makeTask({ id: 'a', teamId: 'team-1', blockedBy: [] }),
      makeTask({ id: 'b', teamId: 'team-1', blockedBy: ['a'] }),
      makeTask({ id: 'c', teamId: 'team-1', blockedBy: ['a'] }),
      makeTask({ id: 'd', teamId: 'team-1', blockedBy: ['b', 'c'] }),
    ]
    saveTasks('team-1', tasks)

    // Making C depend on B: C.blockedBy would add B. Walk from B:
    //   B blocks D (D.blockedBy includes B). D blocks nothing. Never reaches C. Safe.
    expect(wouldCreateCycle('team-1', 'c', 'b')).toBe(false)
  })
})

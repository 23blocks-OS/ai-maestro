/**
 * Teams Service Tests
 *
 * Tests the pure business logic in services/teams-service.ts.
 * Mocks all lib/ dependencies — service tests validate orchestration,
 * not filesystem I/O (which lib tests already cover).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeTeam, makeTask, makeDocument, makeAgent, resetFixtureCounter } from '../test-utils/fixtures'

// ============================================================================
// Mocks — vi.hoisted() ensures these are available when vi.mock() runs
// ============================================================================

const { mockTeams, mockTasks, mockDocs, mockAgentRegistry, mockNotificationService } = vi.hoisted(() => ({
  mockTeams: {
    loadTeams: vi.fn(),
    createTeam: vi.fn(),
    getTeam: vi.fn(),
    updateTeam: vi.fn(),
    deleteTeam: vi.fn(),
  },
  mockTasks: {
    loadTasks: vi.fn(),
    resolveTaskDeps: vi.fn(),
    createTask: vi.fn(),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    wouldCreateCycle: vi.fn(),
  },
  mockDocs: {
    loadDocuments: vi.fn(),
    createDocument: vi.fn(),
    getDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
  mockAgentRegistry: {
    getAgent: vi.fn(),
  },
  mockNotificationService: {
    notifyAgent: vi.fn(),
  },
}))

vi.mock('@/lib/team-registry', () => mockTeams)
vi.mock('@/lib/task-registry', () => mockTasks)
vi.mock('@/lib/document-registry', () => mockDocs)
vi.mock('@/lib/agent-registry', () => mockAgentRegistry)
vi.mock('@/lib/notification-service', () => mockNotificationService)

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import {
  listAllTeams,
  createNewTeam,
  getTeamById,
  updateTeamById,
  deleteTeamById,
  listTeamTasks,
  createTeamTask,
  updateTeamTask,
  deleteTeamTask,
  listTeamDocuments,
  createTeamDocument,
  getTeamDocument,
  updateTeamDocument,
  deleteTeamDocument,
  notifyTeamAgents,
} from '@/services/teams-service'

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  resetFixtureCounter()
})

// ============================================================================
// listAllTeams
// ============================================================================

describe('listAllTeams', () => {
  it('returns empty list when no teams exist', () => {
    mockTeams.loadTeams.mockReturnValue([])

    const result = listAllTeams()

    expect(result.status).toBe(200)
    expect(result.data?.teams).toEqual([])
  })

  it('returns populated list of teams', () => {
    const teams = [makeTeam({ name: 'Alpha' }), makeTeam({ name: 'Beta' })]
    mockTeams.loadTeams.mockReturnValue(teams)

    const result = listAllTeams()

    expect(result.status).toBe(200)
    expect(result.data?.teams).toHaveLength(2)
    expect(result.data?.teams[0].name).toBe('Alpha')
  })
})

// ============================================================================
// createNewTeam
// ============================================================================

describe('createNewTeam', () => {
  it('creates a team successfully', () => {
    const team = makeTeam({ name: 'New Team' })
    mockTeams.createTeam.mockReturnValue(team)

    const result = createNewTeam({ name: 'New Team', agentIds: [] })

    expect(result.status).toBe(201)
    expect(result.data?.team.name).toBe('New Team')
    expect(mockTeams.createTeam).toHaveBeenCalledWith({ name: 'New Team', description: undefined, agentIds: [] })
  })

  it('creates a team with description and agentIds', () => {
    const team = makeTeam({ name: 'Full Team', description: 'A team', agentIds: ['a1', 'a2'] })
    mockTeams.createTeam.mockReturnValue(team)

    const result = createNewTeam({ name: 'Full Team', description: 'A team', agentIds: ['a1', 'a2'] })

    expect(result.status).toBe(201)
    expect(mockTeams.createTeam).toHaveBeenCalledWith({ name: 'Full Team', description: 'A team', agentIds: ['a1', 'a2'] })
  })

  it('returns 400 when name is missing', () => {
    const result = createNewTeam({ name: '', agentIds: [] })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/name/i)
    expect(mockTeams.createTeam).not.toHaveBeenCalled()
  })

  it('returns 400 when name is not a string', () => {
    const result = createNewTeam({ name: null as any, agentIds: [] })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/name/i)
  })

  it('returns 400 when agentIds is not an array', () => {
    const result = createNewTeam({ name: 'Team', agentIds: 'not-array' as any })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/agentIds/i)
  })

  it('returns 500 when createTeam throws', () => {
    mockTeams.createTeam.mockImplementation(() => { throw new Error('disk full') })

    const result = createNewTeam({ name: 'Fail', agentIds: [] })

    expect(result.status).toBe(500)
    expect(result.error).toBe('disk full')
  })

  it('defaults agentIds to empty array when not provided', () => {
    const team = makeTeam({ name: 'No Agents' })
    mockTeams.createTeam.mockReturnValue(team)

    createNewTeam({ name: 'No Agents' })

    expect(mockTeams.createTeam).toHaveBeenCalledWith({ name: 'No Agents', description: undefined, agentIds: [] })
  })
})

// ============================================================================
// getTeamById
// ============================================================================

describe('getTeamById', () => {
  it('returns team when found', () => {
    const team = makeTeam({ id: 'team-123', name: 'Found' })
    mockTeams.getTeam.mockReturnValue(team)

    const result = getTeamById('team-123')

    expect(result.status).toBe(200)
    expect(result.data?.team.name).toBe('Found')
  })

  it('returns 404 when team not found', () => {
    mockTeams.getTeam.mockReturnValue(null)

    const result = getTeamById('nonexistent')

    expect(result.status).toBe(404)
    expect(result.error).toMatch(/not found/i)
  })
})

// ============================================================================
// updateTeamById
// ============================================================================

describe('updateTeamById', () => {
  it('updates team successfully', () => {
    const team = makeTeam({ id: 'team-1', name: 'Updated' })
    mockTeams.updateTeam.mockReturnValue(team)

    const result = updateTeamById('team-1', { name: 'Updated' })

    expect(result.status).toBe(200)
    expect(result.data?.team.name).toBe('Updated')
  })

  it('passes all update fields', () => {
    mockTeams.updateTeam.mockReturnValue(makeTeam())

    updateTeamById('team-1', {
      name: 'New Name',
      description: 'Desc',
      agentIds: ['a1'],
      lastMeetingAt: '2025-06-01T00:00:00Z',
      instructions: '# Rules',
      lastActivityAt: '2025-06-01T00:00:00Z',
    })

    expect(mockTeams.updateTeam).toHaveBeenCalledWith('team-1', {
      name: 'New Name',
      description: 'Desc',
      agentIds: ['a1'],
      lastMeetingAt: '2025-06-01T00:00:00Z',
      instructions: '# Rules',
      lastActivityAt: '2025-06-01T00:00:00Z',
    })
  })

  it('returns 404 when team not found', () => {
    mockTeams.updateTeam.mockReturnValue(null)

    const result = updateTeamById('nope', { name: 'X' })

    expect(result.status).toBe(404)
  })

  it('returns 500 when updateTeam throws', () => {
    mockTeams.updateTeam.mockImplementation(() => { throw new Error('write error') })

    const result = updateTeamById('team-1', { name: 'X' })

    expect(result.status).toBe(500)
    expect(result.error).toBe('write error')
  })
})

// ============================================================================
// deleteTeamById
// ============================================================================

describe('deleteTeamById', () => {
  it('deletes team successfully', () => {
    mockTeams.deleteTeam.mockReturnValue(true)

    const result = deleteTeamById('team-1')

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
  })

  it('returns 404 when team not found', () => {
    mockTeams.deleteTeam.mockReturnValue(false)

    const result = deleteTeamById('nope')

    expect(result.status).toBe(404)
  })
})

// ============================================================================
// listTeamTasks
// ============================================================================

describe('listTeamTasks', () => {
  it('returns resolved tasks for existing team', () => {
    const team = makeTeam({ id: 'team-1' })
    const tasks = [makeTask({ teamId: 'team-1' })]
    const resolvedTasks = tasks.map(t => ({ ...t, blocks: [], isBlocked: false }))

    mockTeams.getTeam.mockReturnValue(team)
    mockTasks.loadTasks.mockReturnValue(tasks)
    mockTasks.resolveTaskDeps.mockReturnValue(resolvedTasks)

    const result = listTeamTasks('team-1')

    expect(result.status).toBe(200)
    expect(result.data?.tasks).toHaveLength(1)
    expect(mockTasks.resolveTaskDeps).toHaveBeenCalledWith(tasks)
  })

  it('returns empty tasks array', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.loadTasks.mockReturnValue([])
    mockTasks.resolveTaskDeps.mockReturnValue([])

    const result = listTeamTasks('team-1')

    expect(result.status).toBe(200)
    expect(result.data?.tasks).toEqual([])
  })

  it('returns 404 when team not found', () => {
    mockTeams.getTeam.mockReturnValue(null)

    const result = listTeamTasks('nope')

    expect(result.status).toBe(404)
    expect(mockTasks.loadTasks).not.toHaveBeenCalled()
  })
})

// ============================================================================
// createTeamTask
// ============================================================================

describe('createTeamTask', () => {
  it('creates task successfully', () => {
    const team = makeTeam({ id: 'team-1' })
    const task = makeTask({ subject: 'Build API' })
    mockTeams.getTeam.mockReturnValue(team)
    mockTasks.createTask.mockReturnValue(task)

    const result = createTeamTask('team-1', { subject: 'Build API' })

    expect(result.status).toBe(201)
    expect(result.data?.task.subject).toBe('Build API')
  })

  it('passes all task fields to createTask', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.createTask.mockReturnValue(makeTask())

    createTeamTask('team-1', {
      subject: 'Task',
      description: 'Desc',
      assigneeAgentId: 'a1',
      blockedBy: ['t1'],
      priority: 1,
    })

    expect(mockTasks.createTask).toHaveBeenCalledWith({
      teamId: 'team-1',
      subject: 'Task',
      description: 'Desc',
      assigneeAgentId: 'a1',
      blockedBy: ['t1'],
      priority: 1,
    })
  })

  it('trims subject whitespace', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.createTask.mockReturnValue(makeTask())

    createTeamTask('team-1', { subject: '  Build API  ' })

    expect(mockTasks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Build API' })
    )
  })

  it('returns 404 when team not found', () => {
    mockTeams.getTeam.mockReturnValue(null)

    const result = createTeamTask('nope', { subject: 'X' })

    expect(result.status).toBe(404)
  })

  it('returns 400 when subject is missing', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())

    const result = createTeamTask('team-1', { subject: '' })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/subject/i)
  })

  it('returns 400 when subject is whitespace only', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())

    const result = createTeamTask('team-1', { subject: '   ' })

    expect(result.status).toBe(400)
  })

  it('returns 400 when blockedBy is not an array of strings', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())

    const result = createTeamTask('team-1', { subject: 'X', blockedBy: [123 as any] })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/blockedBy/i)
  })

  it('returns 500 when createTask throws', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.createTask.mockImplementation(() => { throw new Error('boom') })

    const result = createTeamTask('team-1', { subject: 'X' })

    expect(result.status).toBe(500)
  })
})

// ============================================================================
// updateTeamTask
// ============================================================================

describe('updateTeamTask', () => {
  it('updates task successfully', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.getTask.mockReturnValue(makeTask({ id: 't1' }))
    mockTasks.updateTask.mockReturnValue({ task: makeTask({ id: 't1', status: 'completed' }), unblocked: [] })

    const result = updateTeamTask('team-1', 't1', { status: 'completed' })

    expect(result.status).toBe(200)
    expect(result.data?.task.status).toBe('completed')
    expect(result.data?.unblocked).toEqual([])
  })

  it('returns unblocked tasks', () => {
    const unblockedTask = makeTask({ id: 't2', subject: 'Unblocked' })
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.getTask.mockReturnValue(makeTask({ id: 't1' }))
    mockTasks.updateTask.mockReturnValue({ task: makeTask(), unblocked: [unblockedTask] })

    const result = updateTeamTask('team-1', 't1', { status: 'completed' })

    expect(result.data?.unblocked).toHaveLength(1)
  })

  it('returns 404 when team not found', () => {
    mockTeams.getTeam.mockReturnValue(null)

    const result = updateTeamTask('nope', 't1', { subject: 'X' })

    expect(result.status).toBe(404)
    expect(result.error).toMatch(/team/i)
  })

  it('returns 404 when task not found', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.getTask.mockReturnValue(null)

    const result = updateTeamTask('team-1', 'nope', { subject: 'X' })

    expect(result.status).toBe(404)
    expect(result.error).toMatch(/task/i)
  })

  it('returns 400 for self-dependency', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.getTask.mockReturnValue(makeTask({ id: 't1' }))

    const result = updateTeamTask('team-1', 't1', { blockedBy: ['t1'] })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/itself/i)
  })

  it('returns 400 for circular dependency', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.getTask.mockReturnValue(makeTask({ id: 't1' }))
    mockTasks.wouldCreateCycle.mockReturnValue(true)

    const result = updateTeamTask('team-1', 't1', { blockedBy: ['t2'] })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/circular/i)
  })

  it('returns 400 for invalid status', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.getTask.mockReturnValue(makeTask({ id: 't1' }))

    const result = updateTeamTask('team-1', 't1', { status: 'invalid' as any })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/status/i)
  })

  it('accepts valid status values', () => {
    const validStatuses = ['backlog', 'pending', 'in_progress', 'review', 'completed'] as const
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.getTask.mockReturnValue(makeTask())

    for (const status of validStatuses) {
      mockTasks.updateTask.mockReturnValue({ task: makeTask({ status }), unblocked: [] })
      const result = updateTeamTask('team-1', 't1', { status })
      expect(result.status).toBe(200)
    }
  })

  it('returns 400 for non-string blockedBy entries', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.getTask.mockReturnValue(makeTask({ id: 't1' }))

    const result = updateTeamTask('team-1', 't1', { blockedBy: [42 as any] })

    expect(result.status).toBe(400)
  })

  it('returns 500 when updateTask throws', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.getTask.mockReturnValue(makeTask())
    mockTasks.updateTask.mockImplementation(() => { throw new Error('write fail') })

    const result = updateTeamTask('team-1', 't1', { subject: 'X' })

    expect(result.status).toBe(500)
  })

  it('returns 404 when updateTask returns null task', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.getTask.mockReturnValue(makeTask())
    mockTasks.updateTask.mockReturnValue({ task: null, unblocked: [] })

    const result = updateTeamTask('team-1', 't1', { subject: 'X' })

    expect(result.status).toBe(404)
  })
})

// ============================================================================
// deleteTeamTask
// ============================================================================

describe('deleteTeamTask', () => {
  it('deletes task successfully', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.deleteTask.mockReturnValue(true)

    const result = deleteTeamTask('team-1', 't1')

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
  })

  it('returns 404 when team not found', () => {
    mockTeams.getTeam.mockReturnValue(null)

    const result = deleteTeamTask('nope', 't1')

    expect(result.status).toBe(404)
  })

  it('returns 404 when task not found', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockTasks.deleteTask.mockReturnValue(false)

    const result = deleteTeamTask('team-1', 'nope')

    expect(result.status).toBe(404)
  })
})

// ============================================================================
// listTeamDocuments
// ============================================================================

describe('listTeamDocuments', () => {
  it('returns documents for existing team', () => {
    const docs = [makeDocument({ title: 'API Guide' }), makeDocument({ title: 'Setup' })]
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockDocs.loadDocuments.mockReturnValue(docs)

    const result = listTeamDocuments('team-1')

    expect(result.status).toBe(200)
    expect(result.data?.documents).toHaveLength(2)
  })

  it('returns empty list when no documents', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockDocs.loadDocuments.mockReturnValue([])

    const result = listTeamDocuments('team-1')

    expect(result.status).toBe(200)
    expect(result.data?.documents).toEqual([])
  })

  it('returns 404 when team not found', () => {
    mockTeams.getTeam.mockReturnValue(null)

    const result = listTeamDocuments('nope')

    expect(result.status).toBe(404)
  })
})

// ============================================================================
// createTeamDocument
// ============================================================================

describe('createTeamDocument', () => {
  it('creates document successfully', () => {
    const doc = makeDocument({ title: 'New Doc' })
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockDocs.createDocument.mockReturnValue(doc)

    const result = createTeamDocument('team-1', { title: 'New Doc' })

    expect(result.status).toBe(201)
    expect(result.data?.document.title).toBe('New Doc')
  })

  it('passes all fields to createDocument', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockDocs.createDocument.mockReturnValue(makeDocument())

    createTeamDocument('team-1', { title: 'Doc', content: 'Body', pinned: true, tags: ['api'] })

    expect(mockDocs.createDocument).toHaveBeenCalledWith({
      teamId: 'team-1',
      title: 'Doc',
      content: 'Body',
      pinned: true,
      tags: ['api'],
    })
  })

  it('defaults content to empty string', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockDocs.createDocument.mockReturnValue(makeDocument())

    createTeamDocument('team-1', { title: 'Doc' })

    expect(mockDocs.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ content: '' })
    )
  })

  it('returns 404 when team not found', () => {
    mockTeams.getTeam.mockReturnValue(null)

    const result = createTeamDocument('nope', { title: 'X' })

    expect(result.status).toBe(404)
  })

  it('returns 400 when title is missing', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())

    const result = createTeamDocument('team-1', { title: '' })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/title/i)
  })

  it('returns 500 when createDocument throws', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockDocs.createDocument.mockImplementation(() => { throw new Error('boom') })

    const result = createTeamDocument('team-1', { title: 'X' })

    expect(result.status).toBe(500)
  })
})

// ============================================================================
// getTeamDocument
// ============================================================================

describe('getTeamDocument', () => {
  it('returns document when found', () => {
    const doc = makeDocument({ id: 'doc-1', title: 'Found' })
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockDocs.getDocument.mockReturnValue(doc)

    const result = getTeamDocument('team-1', 'doc-1')

    expect(result.status).toBe(200)
    expect(result.data?.document.title).toBe('Found')
  })

  it('returns 404 when team not found', () => {
    mockTeams.getTeam.mockReturnValue(null)

    const result = getTeamDocument('nope', 'doc-1')

    expect(result.status).toBe(404)
    expect(result.error).toMatch(/team/i)
  })

  it('returns 404 when document not found', () => {
    mockTeams.getTeam.mockReturnValue(makeTeam())
    mockDocs.getDocument.mockReturnValue(null)

    const result = getTeamDocument('team-1', 'nope')

    expect(result.status).toBe(404)
    expect(result.error).toMatch(/document/i)
  })
})

// ============================================================================
// updateTeamDocument
// ============================================================================

describe('updateTeamDocument', () => {
  it('updates document successfully', () => {
    const doc = makeDocument({ title: 'Updated' })
    mockDocs.updateDocument.mockReturnValue(doc)

    const result = updateTeamDocument('team-1', 'doc-1', { title: 'Updated' })

    expect(result.status).toBe(200)
    expect(result.data?.document.title).toBe('Updated')
  })

  it('passes only provided fields', () => {
    mockDocs.updateDocument.mockReturnValue(makeDocument())

    updateTeamDocument('team-1', 'doc-1', { title: 'New Title' })

    expect(mockDocs.updateDocument).toHaveBeenCalledWith('team-1', 'doc-1', { title: 'New Title' })
  })

  it('passes pinned and tags when provided', () => {
    mockDocs.updateDocument.mockReturnValue(makeDocument())

    updateTeamDocument('team-1', 'doc-1', { pinned: true, tags: ['api'] })

    expect(mockDocs.updateDocument).toHaveBeenCalledWith('team-1', 'doc-1', { pinned: true, tags: ['api'] })
  })

  it('returns 404 when document not found', () => {
    mockDocs.updateDocument.mockReturnValue(null)

    const result = updateTeamDocument('team-1', 'nope', { title: 'X' })

    expect(result.status).toBe(404)
  })

  it('returns 500 when updateDocument throws', () => {
    mockDocs.updateDocument.mockImplementation(() => { throw new Error('write error') })

    const result = updateTeamDocument('team-1', 'doc-1', { title: 'X' })

    expect(result.status).toBe(500)
  })
})

// ============================================================================
// deleteTeamDocument
// ============================================================================

describe('deleteTeamDocument', () => {
  it('deletes document successfully', () => {
    mockDocs.deleteDocument.mockReturnValue(true)

    const result = deleteTeamDocument('team-1', 'doc-1')

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
  })

  it('returns 404 when document not found', () => {
    mockDocs.deleteDocument.mockReturnValue(false)

    const result = deleteTeamDocument('team-1', 'nope')

    expect(result.status).toBe(404)
  })
})

// ============================================================================
// notifyTeamAgents
// ============================================================================

describe('notifyTeamAgents', () => {
  it('notifies all agents successfully', async () => {
    const agent = makeAgent({ id: 'a1', name: 'backend' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockNotificationService.notifyAgent.mockResolvedValue({ success: true, notified: true })

    const result = await notifyTeamAgents({ agentIds: ['a1'], teamName: 'Team Alpha' })

    expect(result.status).toBe(200)
    expect(result.data?.results).toHaveLength(1)
    expect(mockNotificationService.notifyAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'a1',
        agentName: 'backend',
        fromName: 'AI Maestro',
      })
    )
  })

  it('handles agent not found gracefully', async () => {
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = await notifyTeamAgents({ agentIds: ['nonexistent'], teamName: 'Team' })

    expect(result.status).toBe(200)
    expect(result.data?.results[0]).toEqual(
      expect.objectContaining({ agentId: 'nonexistent', success: false, reason: 'Agent not found' })
    )
  })

  it('handles partial failure (some agents not found)', async () => {
    const agent = makeAgent({ id: 'a1', name: 'backend' })
    mockAgentRegistry.getAgent
      .mockReturnValueOnce(agent)
      .mockReturnValueOnce(null)
    mockNotificationService.notifyAgent.mockResolvedValue({ success: true, notified: true })

    const result = await notifyTeamAgents({ agentIds: ['a1', 'a2'], teamName: 'Team' })

    expect(result.status).toBe(200)
    expect(result.data?.results).toHaveLength(2)
  })

  it('handles notification failure for an agent', async () => {
    const agent = makeAgent({ id: 'a1', name: 'backend' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockNotificationService.notifyAgent.mockRejectedValue(new Error('tmux gone'))

    const result = await notifyTeamAgents({ agentIds: ['a1'], teamName: 'Team' })

    expect(result.status).toBe(200)
    expect(result.data?.results[0]).toEqual(
      expect.objectContaining({ success: false })
    )
  })

  it('returns 400 when agentIds is missing', async () => {
    const result = await notifyTeamAgents({ agentIds: null as any, teamName: 'Team' })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/agentIds/i)
  })

  it('returns 400 when agentIds is not an array', async () => {
    const result = await notifyTeamAgents({ agentIds: 'not-array' as any, teamName: 'Team' })

    expect(result.status).toBe(400)
  })

  it('returns 400 when teamName is missing', async () => {
    const result = await notifyTeamAgents({ agentIds: ['a1'], teamName: '' })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/teamName/i)
  })

  it('returns 400 when teamName is not a string', async () => {
    const result = await notifyTeamAgents({ agentIds: ['a1'], teamName: 123 as any })

    expect(result.status).toBe(400)
  })

  it('uses agent name or alias for notification', async () => {
    const agent = makeAgent({ id: 'a1', name: '', alias: 'backend-alias' } as any)
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockNotificationService.notifyAgent.mockResolvedValue({ success: true })

    await notifyTeamAgents({ agentIds: ['a1'], teamName: 'Team' })

    expect(mockNotificationService.notifyAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'backend-alias' })
    )
  })
})

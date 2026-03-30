/**
 * Groups Service
 *
 * Pure business logic for group CRUD and subscriber management.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * Mirrors the ServiceResult pattern from services/teams-service.ts but without governance.
 *
 * Covers:
 *   GET    /api/groups                  -> listAllGroups
 *   POST   /api/groups                  -> createNewGroup
 *   GET    /api/groups/[id]             -> getGroupById
 *   PUT    /api/groups/[id]             -> updateGroupById
 *   DELETE /api/groups/[id]             -> deleteGroupById
 *   POST   /api/groups/[id]/subscribe   -> subscribeAgent
 *   POST   /api/groups/[id]/unsubscribe -> unsubscribeAgent
 */

import {
  loadGroups,
  createGroup,
  getGroup,
  updateGroup,
  deleteGroup,
  addSubscriber,
  removeSubscriber,
  GroupValidationException,
} from '@/lib/group-registry'
import { getAgent } from '@/lib/agent-registry'
import { notifyAgent } from '@/lib/notification-service'
import type { Group } from '@/types/group'
import type { ServiceResult } from '@/types/service'

// ===========================================================================
// PUBLIC API -- called by API routes
// ===========================================================================

/**
 * List all groups.
 */
export function listAllGroups(): ServiceResult<{ groups: Group[] }> {
  const groups = loadGroups()
  return { data: { groups }, status: 200 }
}

/**
 * Create a new group.
 */
export async function createNewGroup(params: {
  name: string
  description?: string
  subscriberIds?: string[]
}): Promise<ServiceResult<{ group: Group }>> {
  const { name, description, subscriberIds } = params

  if (!name || typeof name !== 'string') {
    return { error: 'Group name is required', status: 400 }
  }

  if (subscriberIds && !Array.isArray(subscriberIds)) {
    return { error: 'subscriberIds must be an array', status: 400 }
  }

  try {
    const group = await createGroup({ name, description, subscriberIds })
    return { data: { group }, status: 201 }
  } catch (err) {
    if (err instanceof GroupValidationException) {
      return { error: err.message, status: err.code }
    }
    throw err
  }
}

/**
 * Get a group by ID.
 */
export function getGroupById(id: string): ServiceResult<{ group: Group }> {
  const group = getGroup(id)
  if (!group) {
    return { error: 'Group not found', status: 404 }
  }
  return { data: { group }, status: 200 }
}

/**
 * Update a group by ID.
 */
export async function updateGroupById(
  id: string,
  updates: {
    name?: string
    description?: string
    subscriberIds?: string[]
    lastMeetingAt?: string
  }
): Promise<ServiceResult<{ group: Group }>> {
  try {
    const group = await updateGroup(id, updates)
    if (!group) {
      return { error: 'Group not found', status: 404 }
    }
    return { data: { group }, status: 200 }
  } catch (err) {
    if (err instanceof GroupValidationException) {
      return { error: err.message, status: err.code }
    }
    throw err
  }
}

/**
 * Delete a group by ID.
 */
export async function deleteGroupById(id: string): Promise<ServiceResult<{ deleted: true }>> {
  const deleted = await deleteGroup(id)
  if (!deleted) {
    return { error: 'Group not found', status: 404 }
  }
  return { data: { deleted: true }, status: 200 }
}

/**
 * Subscribe an agent to a group.
 * Idempotent — adding an already-subscribed agent is a no-op.
 *
 * Uses addSubscriber() which does read+check+write inside a single file lock
 * to avoid TOCTOU races on concurrent subscribe requests.
 */
export async function subscribeAgent(
  groupId: string,
  agentId: string
): Promise<ServiceResult<{ group: Group }>> {
  if (!agentId || typeof agentId !== 'string') {
    return { error: 'agentId is required', status: 400 }
  }

  try {
    const group = await addSubscriber(groupId, agentId)
    if (!group) {
      return { error: 'Group not found', status: 404 }
    }
    return { data: { group }, status: 200 }
  } catch (err) {
    if (err instanceof GroupValidationException) {
      return { error: err.message, status: err.code }
    }
    throw err
  }
}

/**
 * Unsubscribe an agent from a group.
 * Idempotent — removing a non-subscribed agent is a no-op.
 *
 * Uses removeSubscriber() which does read+check+write inside a single file lock
 * to avoid TOCTOU races on concurrent unsubscribe requests.
 */
export async function unsubscribeAgent(
  groupId: string,
  agentId: string
): Promise<ServiceResult<{ group: Group }>> {
  if (!agentId || typeof agentId !== 'string') {
    return { error: 'agentId is required', status: 400 }
  }

  try {
    const group = await removeSubscriber(groupId, agentId)
    if (!group) {
      return { error: 'Group not found', status: 404 }
    }
    return { data: { group }, status: 200 }
  } catch (err) {
    if (err instanceof GroupValidationException) {
      return { error: err.message, status: err.code }
    }
    throw err
  }
}

// ===========================================================================
// Notifications
// ===========================================================================

/** Result for each subscriber notification attempt */
export interface GroupNotifyResult {
  agentId: string
  agentName?: string
  success: boolean
  notified?: boolean  // True if notification was actually delivered (from NotificationResult spread)
  reason?: string
  error?: string
}

/**
 * Notify all subscribers of a group (e.g., when a meeting starts).
 * Same pattern as notifyTeamAgents in teams-service.ts but uses group data.
 */
export async function notifyGroupSubscribers(
  groupId: string,
  message: string,
  priority?: string
): Promise<ServiceResult<{ results: GroupNotifyResult[] }>> {
  const group = getGroup(groupId)
  if (!group) {
    return { error: 'Group not found', status: 404 }
  }

  if (!group.subscriberIds || group.subscriberIds.length === 0) {
    return { data: { results: [] }, status: 200 }
  }

  // Strip control characters to prevent command injection via tmux send-keys
  const safeGroupName = (group.name || '').replace(/[\x00-\x1F\x7F]/g, '')
  const safeMessage = (message || '').replace(/[\x00-\x1F\x7F]/g, '')

  try {
    const results = await Promise.all(
      group.subscriberIds.map(async (agentId: string) => {
        const agent = getAgent(agentId)
        if (!agent) {
          return { agentId, success: false, reason: 'Agent not found' }
        }

        const agentName = agent.name || agent.alias || 'unknown'
        try {
          const result = await notifyAgent({
            agentId: agent.id,
            agentName,
            agentHost: agent.hostId,
            fromName: 'AI Maestro',
            subject: safeMessage || `Group "${safeGroupName}" notification`,
            messageId: `group-notify-${Date.now()}`,
            messageType: 'notification',
            priority: priority || 'normal',
          })
          return { agentId, agentName, ...result }
        } catch (error) {
          return { agentId, agentName, success: false, error: String(error) }
        }
      })
    )

    return { data: { results }, status: 200 }
  } catch (error) {
    console.error('Failed to notify group subscribers:', error)
    return { error: error instanceof Error ? error.message : 'Failed to notify group', status: 500 }
  }
}

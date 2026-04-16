/**
 * Messages & Meetings Service
 *
 * Pure business logic extracted from app/api/messages/** and app/api/meetings/** routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/messages                 -> getMessages
 *   POST   /api/messages                 -> sendMessage
 *   PATCH  /api/messages                 -> updateMessage
 *   DELETE /api/messages                 -> removeMessage
 *   POST   /api/messages/forward         -> forwardMessage
 *   GET    /api/messages/meeting         -> getMeetingMessages
 *   GET    /api/meetings                 -> listMeetings
 *   POST   /api/meetings                 -> createNewMeeting
 *   GET    /api/meetings/[id]            -> getMeetingById
 *   PATCH  /api/meetings/[id]            -> updateExistingMeeting
 *   DELETE /api/meetings/[id]            -> deleteExistingMeeting
 */

import {
  listInboxMessages,
  listSentMessages,
  getSentCount,
  getMessage,
  markMessageAsRead,
  archiveMessage,
  deleteMessage,
  getUnreadCount,
  getMessageStats,
  listAgentsWithMessages,
  resolveAgentIdentifier,
} from '@/lib/messageQueue'
import type { MessageSummary } from '@/lib/messageQueue'
import { sendFromUI } from '@/lib/message-send'
import { forwardFromUI } from '@/lib/message-send'
import { searchAgents } from '@/lib/agent-registry'
import { getSelfHostId, getSelfHost } from '@/lib/hosts-config'
import {
  loadMeetings,
  createMeeting,
  getMeeting,
  updateMeeting,
  deleteMeeting,
} from '@/lib/meeting-registry'
import type { SidebarMode } from '@/types/team'
import { type ServiceResult, missingField, notFound, invalidRequest, operationFailed } from '@/services/service-errors'

// ---------------------------------------------------------------------------
// Messages: GET /api/messages
// ---------------------------------------------------------------------------

export interface GetMessagesParams {
  agent?: string | null
  id?: string | null
  action?: string | null
  box?: string | null
  limit?: string | null
  status?: string | null
  priority?: string | null
  from?: string | null
  to?: string | null
}

export async function getMessages(params: GetMessagesParams): Promise<ServiceResult<any>> {
  const {
    agent: agentIdentifier,
    id: messageId,
    action,
    box = 'inbox',
  } = params

  // Resolve agent info (exact match)
  if (action === 'resolve' && agentIdentifier) {
    const resolved = resolveAgentIdentifier(agentIdentifier)
    if (!resolved) {
      return notFound('Agent', agentIdentifier || undefined)
    }
    return { data: { resolved }, status: 200 }
  }

  // Search agents (partial/fuzzy match)
  if (action === 'search' && agentIdentifier) {
    const matches = searchAgents(agentIdentifier)
    const selfHostId = getSelfHostId()
    const selfHost = getSelfHost()

    const results = matches.map(agent => ({
      agentId: agent.id,
      alias: agent.alias || agent.name,
      name: agent.name,
      label: agent.label,
      displayName: agent.label || agent.alias || agent.name,
      hostId: selfHostId,
      hostUrl: selfHost?.url || `http://localhost:23000`,
    }))

    return {
      data: {
        query: agentIdentifier,
        count: results.length,
        results,
      },
      status: 200,
    }
  }

  // Get specific message
  if (agentIdentifier && messageId) {
    const message = await getMessage(agentIdentifier, messageId, box as 'inbox' | 'sent')
    if (!message) {
      return notFound('Message', messageId)
    }
    return { data: message, status: 200 }
  }

  // Get unread count (inbox only)
  if (action === 'unread-count' && agentIdentifier) {
    const count = await getUnreadCount(agentIdentifier)
    return { data: { count }, status: 200 }
  }

  // Get sent count
  if (action === 'sent-count' && agentIdentifier) {
    const count = await getSentCount(agentIdentifier)
    return { data: { count }, status: 200 }
  }

  // Get message stats
  if (action === 'stats' && agentIdentifier) {
    const stats = await getMessageStats(agentIdentifier)
    return { data: stats, status: 200 }
  }

  // List all agents with messages
  if (action === 'agents' || action === 'sessions') {
    const agents = await listAgentsWithMessages()
    return { data: { agents, sessions: agents }, status: 200 }
  }

  // List messages for an agent
  if (!agentIdentifier) {
    return missingField('agent')
  }

  // Parse limit parameter (default: 25 for performance, 0 = unlimited)
  const limit = params.limit === null || params.limit === undefined
    ? 25
    : parseInt(params.limit, 10) || 0

  // List sent messages
  if (box === 'sent') {
    const priority = params.priority as 'low' | 'normal' | 'high' | 'urgent' | undefined
    const to = params.to || undefined

    const messages = await listSentMessages(agentIdentifier, { priority, to, limit })
    return { data: { messages, limit }, status: 200 }
  }

  // List inbox messages (default)
  const status = params.status as 'unread' | 'read' | 'archived' | undefined
  const priority = params.priority as 'low' | 'normal' | 'high' | 'urgent' | undefined
  const from = params.from || undefined

  const messages = await listInboxMessages(agentIdentifier, { status, priority, from, limit })
  return { data: { messages, limit }, status: 200 }
}

// ---------------------------------------------------------------------------
// Messages: POST /api/messages
// ---------------------------------------------------------------------------

export interface SendMessageParams {
  from: string
  to: string
  subject: string
  content: {
    type: 'request' | 'response' | 'notification' | 'update'
    message: string
    context?: Record<string, any>
    attachments?: Array<{ name: string; path: string; type: string }>
  }
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  inReplyTo?: string
  fromHost?: string
  toHost?: string
  fromAlias?: string
  toAlias?: string
  fromLabel?: string
  toLabel?: string
  fromVerified?: boolean
}

export async function sendMessage(params: SendMessageParams): Promise<ServiceResult<any>> {
  const { from, to, subject, content } = params

  // Validate required fields
  if (!from || !to || !subject || !content) {
    return invalidRequest('Missing required fields: from, to, subject, content')
  }

  // Validate content structure
  if (!content.type || !content.message) {
    return invalidRequest('Content must have type and message fields')
  }

  try {
    const result = await sendFromUI({
      from,
      to,
      subject,
      content,
      priority: params.priority,
      inReplyTo: params.inReplyTo,
      fromHost: params.fromHost,
      toHost: params.toHost,
      fromAlias: params.fromAlias,
      toAlias: params.toAlias,
      fromLabel: params.fromLabel,
      toLabel: params.toLabel,
      fromVerified: params.fromVerified,
    })

    return {
      data: {
        message: result.message,
        notified: result.notified,
      },
      status: 201,
    }
  } catch (error) {
    console.error('Error sending message:', error)
    return operationFailed('send message', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// Messages: PATCH /api/messages
// ---------------------------------------------------------------------------

export async function updateMessage(
  agentIdentifier: string | null,
  messageId: string | null,
  action: string | null,
): Promise<ServiceResult<{ success: boolean }>> {
  if (!agentIdentifier || !messageId) {
    return invalidRequest('Agent identifier and message ID required')
  }

  try {
    let success = false

    switch (action) {
      case 'read':
        success = await markMessageAsRead(agentIdentifier, messageId)
        break
      case 'archive':
        success = await archiveMessage(agentIdentifier, messageId)
        break
      default:
        return invalidRequest('Invalid action')
    }

    if (!success) {
      return notFound('Message', messageId)
    }

    return { data: { success: true }, status: 200 }
  } catch (error) {
    console.error('Error updating message:', error)
    return operationFailed('update message', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// Messages: DELETE /api/messages
// ---------------------------------------------------------------------------

export async function removeMessage(
  agentIdentifier: string | null,
  messageId: string | null,
): Promise<ServiceResult<{ success: boolean }>> {
  if (!agentIdentifier || !messageId) {
    return invalidRequest('Agent identifier and message ID required')
  }

  try {
    const success = await deleteMessage(agentIdentifier, messageId)

    if (!success) {
      return notFound('Message', messageId)
    }

    return { data: { success: true }, status: 200 }
  } catch (error) {
    console.error('Error deleting message:', error)
    return operationFailed('delete message', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// Messages: POST /api/messages/forward
// ---------------------------------------------------------------------------

export interface ForwardMessageParams {
  messageId?: string
  originalMessage?: any
  fromSession: string
  toSession: string
  forwardNote?: string
}

export async function forwardMessage(params: ForwardMessageParams): Promise<ServiceResult<any>> {
  const { messageId, originalMessage, fromSession, toSession, forwardNote } = params

  // Validate required fields
  if ((!messageId && !originalMessage) || !fromSession || !toSession) {
    return invalidRequest('Either messageId or originalMessage, plus fromSession and toSession are required')
  }

  // Validate that from and to sessions are different
  if (fromSession === toSession) {
    return invalidRequest('Cannot forward message to the same session')
  }

  try {
    const result = await forwardFromUI({
      originalMessageId: messageId || '',
      fromAgent: fromSession,
      toAgent: toSession,
      forwardNote: forwardNote || undefined,
      providedOriginalMessage: originalMessage || undefined,
    })

    return {
      data: {
        success: true,
        message: 'Message forwarded successfully',
        forwardedMessage: {
          id: result.message.id,
          to: result.message.to,
          subject: result.message.subject,
        },
      },
      status: 200,
    }
  } catch (error) {
    console.error('Error forwarding message:', error)
    return operationFailed('forward message', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// Messages: GET /api/messages/meeting
// ---------------------------------------------------------------------------

export interface GetMeetingMessagesParams {
  meetingId: string | null
  participants: string | null
  since: string | null
}

export async function getMeetingMessages(
  params: GetMeetingMessagesParams,
): Promise<ServiceResult<{ meetingId: string; messages: MessageSummary[]; count: number }>> {
  const { meetingId, participants: participantsParam, since } = params

  if (!meetingId) {
    return missingField('meetingId')
  }
  if (!participantsParam) {
    return missingField('participants')
  }

  const participantIds = participantsParam.split(',').filter(Boolean)
  // Include 'maestro' as a pseudo-participant
  const allParticipants = [...new Set([...participantIds, 'maestro'])]

  const seenIds = new Set<string>()
  const meetingMessages: MessageSummary[] = []

  // Fetch inbox and sent for each participant
  for (const participantId of allParticipants) {
    try {
      const [inbox, sent] = await Promise.all([
        listInboxMessages(participantId, { limit: 0, previewLength: 2000 }),
        listSentMessages(participantId, { limit: 0, previewLength: 2000 }),
      ])

      const allMessages = [...inbox, ...sent]

      for (const msg of allMessages) {
        if (seenIds.has(msg.id)) continue
        // Check if message belongs to this meeting (subject prefix or context tag)
        if (msg.subject.startsWith(`[MEETING:${meetingId}]`)) {
          if (since && new Date(msg.timestamp) <= new Date(since)) continue
          seenIds.add(msg.id)
          meetingMessages.push(msg)
        }
      }
    } catch {
      // Skip participants that can't be resolved
    }
  }

  // Sort chronologically (oldest first for chat display)
  meetingMessages.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )

  // Deduplicate broadcast messages: same sender + same preview + similar timestamp -> keep one
  const deduped: MessageSummary[] = []
  const broadcastSeen = new Set<string>()
  for (const msg of meetingMessages) {
    // Create a key from sender + preview + second-level timestamp
    const ts = msg.timestamp.slice(0, 19) // trim to second precision
    const dedupeKey = `${msg.from}|${msg.preview}|${ts}`
    if (broadcastSeen.has(dedupeKey)) continue
    broadcastSeen.add(dedupeKey)
    deduped.push(msg)
  }

  return {
    data: {
      meetingId,
      messages: deduped,
      count: deduped.length,
    },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// Meetings: GET /api/meetings
// ---------------------------------------------------------------------------

export function listMeetings(statusFilter?: string | null): ServiceResult<{ meetings: any[] }> {
  let meetings = loadMeetings()
  if (statusFilter) {
    meetings = meetings.filter(m => m.status === statusFilter)
  }
  return { data: { meetings }, status: 200 }
}

// ---------------------------------------------------------------------------
// Meetings: POST /api/meetings
// ---------------------------------------------------------------------------

export interface CreateMeetingParams {
  name: string
  agentIds: string[]
  teamId?: string | null
  sidebarMode?: SidebarMode
}

export function createNewMeeting(
  params: CreateMeetingParams,
): ServiceResult<{ meeting: any }> {
  const { name, agentIds, teamId, sidebarMode } = params

  if (!name || typeof name !== 'string') {
    return missingField('name')
  }

  if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
    return invalidRequest('At least one agent is required')
  }

  try {
    const meeting = createMeeting({
      name,
      agentIds,
      teamId: teamId || null,
      sidebarMode,
    })
    return { data: { meeting }, status: 201 }
  } catch (error) {
    console.error('Failed to create meeting:', error)
    return operationFailed('create meeting', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// Meetings: GET /api/meetings/[id]
// ---------------------------------------------------------------------------

export function getMeetingById(id: string): ServiceResult<{ meeting: any }> {
  const meeting = getMeeting(id)
  if (!meeting) {
    return notFound('Meeting', id)
  }
  return { data: { meeting }, status: 200 }
}

// ---------------------------------------------------------------------------
// Meetings: PATCH /api/meetings/[id]
// ---------------------------------------------------------------------------

export interface UpdateMeetingParams {
  name?: string
  agentIds?: string[]
  status?: string
  activeAgentId?: string | null
  sidebarMode?: SidebarMode
  lastActiveAt?: string
  endedAt?: string
  teamId?: string | null
}

export function updateExistingMeeting(
  id: string,
  updates: UpdateMeetingParams,
): ServiceResult<{ meeting: any }> {
  try {
    const meeting = updateMeeting(id, {
      name: updates.name,
      agentIds: updates.agentIds,
      status: updates.status as any,
      activeAgentId: updates.activeAgentId,
      sidebarMode: updates.sidebarMode,
      lastActiveAt: updates.lastActiveAt,
      endedAt: updates.endedAt,
      teamId: updates.teamId,
    })
    if (!meeting) {
      return notFound('Meeting', id)
    }

    return { data: { meeting }, status: 200 }
  } catch (error) {
    console.error('Failed to update meeting:', error)
    return operationFailed('update meeting', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// Meetings: DELETE /api/meetings/[id]
// ---------------------------------------------------------------------------

export function deleteExistingMeeting(id: string): ServiceResult<{ success: boolean }> {
  const deleted = deleteMeeting(id)
  if (!deleted) {
    return notFound('Meeting', id)
  }
  return { data: { success: true }, status: 200 }
}

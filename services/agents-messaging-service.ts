/**
 * Agents Messaging Service
 *
 * Pure business logic extracted from app/api/agents/[id]/messages/**,
 * app/api/agents/[id]/amp/addresses/**, app/api/agents/[id]/email/addresses/**,
 * and app/api/agents/email-index routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/agents/:id/messages                     -> listMessages
 *   POST   /api/agents/:id/messages                     -> sendMessage
 *   GET    /api/agents/:id/messages/:messageId           -> getMessage
 *   PATCH  /api/agents/:id/messages/:messageId           -> updateMessage
 *   DELETE /api/agents/:id/messages/:messageId           -> deleteMessage
 *   POST   /api/agents/:id/messages/:messageId           -> forwardMessage
 *   GET    /api/agents/:id/amp/addresses                 -> listAMPAddresses
 *   POST   /api/agents/:id/amp/addresses                 -> addAMPAddressToAgent
 *   GET    /api/agents/:id/amp/addresses/:address        -> getAMPAddress
 *   PATCH  /api/agents/:id/amp/addresses/:address        -> updateAMPAddressOnAgent
 *   DELETE /api/agents/:id/amp/addresses/:address        -> removeAMPAddressFromAgent
 *   GET    /api/agents/:id/email/addresses               -> listEmailAddresses
 *   POST   /api/agents/:id/email/addresses               -> addEmailAddressToAgent
 *   GET    /api/agents/:id/email/addresses/:address      -> getEmailAddress
 *   PATCH  /api/agents/:id/email/addresses/:address      -> updateEmailAddressOnAgent
 *   DELETE /api/agents/:id/email/addresses/:address      -> removeEmailAddressFromAgent
 *   GET    /api/agents/email-index                       -> getEmailIndex
 */

import {
  listAgentInboxMessages,
  listAgentSentMessages,
  getAgentMessageStats,
  getAgentMessage,
  markAgentMessageAsRead,
  archiveAgentMessage,
  deleteAgentMessage,
} from '@/lib/agent-messaging'
import { sendFromUI, forwardFromUI } from '@/lib/message-send'
import type { Message } from '@/lib/messageQueue'
import {
  getAgent,
  getAgentAMPAddresses,
  addAMPAddress,
  removeAMPAddress,
  updateAMPAddress,
  getAgentEmailAddresses,
  addEmailAddress,
  removeEmailAddress,
  updateEmailAddress,
  getEmailIndex as getEmailIndexFromRegistry,
  findAgentByEmail,
} from '@/lib/agent-registry'
import { emitEmailChanged } from '@/lib/webhook-service'
import { getHosts, getSelfHostId, isSelf } from '@/lib/hosts-config'
import { getPublicUrl } from '@/lib/host-sync'
import type { AddAMPAddressRequest, AddEmailAddressRequest, EmailConflictError, EmailIndexResponse, FederatedEmailIndexResponse } from '@/types/agent'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const FEDERATED_TIMEOUT = 5000

async function fetchRemoteEmailIndex(
  hostUrl: string,
  addressQuery?: string
): Promise<{ success: boolean; data?: EmailIndexResponse; error?: string }> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FEDERATED_TIMEOUT)

    let url = `${hostUrl}/api/agents/email-index`
    if (addressQuery) {
      url += `?address=${encodeURIComponent(addressQuery)}`
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'X-Federated-Query': 'true' },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` }
    }

    const data: EmailIndexResponse = await response.json()
    return { success: true, data }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

async function federatedEmailLookup(
  addressQuery?: string
): Promise<FederatedEmailIndexResponse> {
  const startTime = Date.now()
  const hosts = getHosts()
  const selfHostId = getSelfHostId()
  const selfUrl = getPublicUrl()

  const aggregatedEmails: EmailIndexResponse = {}
  const hostsFailed: string[] = []
  let hostsSucceeded = 0

  // Get local emails first
  let localIndex: EmailIndexResponse
  if (addressQuery) {
    const agentId = findAgentByEmail(addressQuery)
    if (agentId) {
      const agent = getAgent(agentId)
      const addresses = getAgentEmailAddresses(agentId)
      const matchingAddr = addresses.find(
        a => a.address.toLowerCase() === addressQuery.toLowerCase()
      )
      if (agent && matchingAddr) {
        localIndex = {
          [matchingAddr.address.toLowerCase()]: {
            agentId: agent.id,
            agentName: agent.name || agent.alias || 'unknown',
            hostId: agent.hostId || selfHostId,
            hostUrl: selfUrl,
            displayName: matchingAddr.displayName,
            primary: matchingAddr.primary || false,
            metadata: matchingAddr.metadata,
          }
        }
      } else {
        localIndex = {}
      }
    } else {
      localIndex = {}
    }
  } else {
    localIndex = getEmailIndexFromRegistry()
  }

  for (const [email, entry] of Object.entries(localIndex)) {
    aggregatedEmails[email] = { ...entry, hostUrl: selfUrl }
  }
  hostsSucceeded++

  const remoteHosts = hosts.filter(h => !isSelf(h.id) && h.enabled)

  const remoteResults = await Promise.all(
    remoteHosts.map(async (host) => {
      const result = await fetchRemoteEmailIndex(host.url, addressQuery)
      return { hostId: host.id, hostUrl: host.url, ...result }
    })
  )

  for (const result of remoteResults) {
    if (result.success && result.data) {
      hostsSucceeded++
      for (const [email, entry] of Object.entries(result.data)) {
        if (!aggregatedEmails[email]) {
          aggregatedEmails[email] = { ...entry, hostUrl: result.hostUrl }
        }
      }
    } else {
      hostsFailed.push(result.hostId)
      console.warn(`[Messaging Service] Failed to query ${result.hostId}: ${result.error}`)
    }
  }

  return {
    emails: aggregatedEmails,
    meta: {
      federated: true,
      hostsQueried: 1 + remoteHosts.length,
      hostsSucceeded,
      hostsFailed,
      queryTime: Date.now() - startTime,
    }
  }
}

// ===========================================================================
// PUBLIC API — Messages (GET/POST /api/agents/:id/messages)
// ===========================================================================

export async function listMessages(
  agentId: string,
  params: {
    box?: string
    status?: any
    priority?: any
    from?: string
    to?: string
  }
): Promise<ServiceResult<any>> {
  try {
    const { box = 'inbox', status, priority, from, to } = params

    if (box === 'sent') {
      const messages = await listAgentSentMessages(agentId, { priority, to })
      return { data: { messages }, status: 200 }
    } else if (box === 'stats') {
      const stats = await getAgentMessageStats(agentId)
      return { data: { stats }, status: 200 }
    } else {
      const messages = await listAgentInboxMessages(agentId, { status, priority, from })
      return { data: { messages }, status: 200 }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list messages'
    console.error('Failed to list messages:', error)
    return { error: message, status: 500 }
  }
}

export async function sendMessage(
  agentId: string,
  body: { to: string; subject: string; content: Message['content']; priority?: Message['priority']; inReplyTo?: string }
): Promise<ServiceResult<any>> {
  try {
    const { to, subject, content, priority, inReplyTo } = body

    if (!to || !subject || !content) {
      return { error: 'Missing required fields: to, subject, content', status: 400 }
    }

    const result = await sendFromUI({
      from: agentId,
      to,
      subject,
      content,
      priority,
      inReplyTo,
    })

    return { data: { message: result.message, notified: result.notified }, status: 201 }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send message'
    console.error('Failed to send message:', error)
    return { error: message, status: 500 }
  }
}

// ===========================================================================
// PUBLIC API — Single Message (GET/PATCH/DELETE/POST /api/agents/:id/messages/:messageId)
// ===========================================================================

export async function getMessage(
  agentId: string,
  messageId: string,
  box: 'inbox' | 'sent' = 'inbox'
): Promise<ServiceResult<any>> {
  try {
    const msg = await getAgentMessage(agentId, messageId, box)

    if (!msg) {
      return { error: 'Message not found', status: 404 }
    }

    return { data: { message: msg }, status: 200 }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get message'
    console.error('Failed to get message:', error)
    return { error: message, status: 500 }
  }
}

export async function updateMessage(
  agentId: string,
  messageId: string,
  body: { action: string }
): Promise<ServiceResult<any>> {
  try {
    const { action } = body

    if (action === 'read') {
      const success = await markAgentMessageAsRead(agentId, messageId)
      if (!success) {
        return { error: 'Message not found', status: 404 }
      }
      return { data: { success: true }, status: 200 }
    } else if (action === 'archive') {
      const success = await archiveAgentMessage(agentId, messageId)
      if (!success) {
        return { error: 'Message not found', status: 404 }
      }
      return { data: { success: true }, status: 200 }
    } else {
      return { error: 'Invalid action', status: 400 }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update message'
    console.error('Failed to update message:', error)
    return { error: message, status: 500 }
  }
}

export async function deleteMessageById(
  agentId: string,
  messageId: string
): Promise<ServiceResult<any>> {
  try {
    const success = await deleteAgentMessage(agentId, messageId)

    if (!success) {
      return { error: 'Message not found', status: 404 }
    }

    return { data: { success: true }, status: 200 }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete message'
    console.error('Failed to delete message:', error)
    return { error: message, status: 500 }
  }
}

export async function forwardMessage(
  agentId: string,
  messageId: string,
  body: { to: string; note?: string }
): Promise<ServiceResult<any>> {
  try {
    const { to, note } = body

    if (!to) {
      return { error: 'Missing required field: to', status: 400 }
    }

    const result = await forwardFromUI({
      originalMessageId: messageId,
      fromAgent: agentId,
      toAgent: to,
      forwardNote: note,
    })

    return { data: { message: result.message }, status: 201 }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to forward message'
    console.error('Failed to forward message:', error)
    return { error: message, status: 500 }
  }
}

// ===========================================================================
// PUBLIC API — AMP Addresses (GET/POST /api/agents/:id/amp/addresses)
// ===========================================================================

export function listAMPAddresses(agentId: string): ServiceResult<any> {
  try {
    const agent = getAgent(agentId)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    const addresses = getAgentAMPAddresses(agentId)

    return {
      data: { agentId: agent.id, agentName: agent.name || agent.alias, addresses },
      status: 200
    }
  } catch (error) {
    console.error('Failed to get AMP addresses:', error)
    return { error: 'Failed to get AMP addresses', status: 500 }
  }
}

export function addAMPAddressToAgent(
  agentId: string,
  body: AddAMPAddressRequest
): ServiceResult<any> {
  try {
    if (!body.address) {
      return { error: 'AMP address is required', status: 400 }
    }
    if (!body.provider) {
      return { error: 'Provider is required', status: 400 }
    }
    if (!body.type || !['local', 'cloud'].includes(body.type)) {
      return { error: 'Type must be "local" or "cloud"', status: 400 }
    }

    const agent = addAMPAddress(agentId, {
      address: body.address,
      provider: body.provider,
      type: body.type,
      tenant: body.tenant,
      primary: body.primary,
      displayName: body.displayName,
      metadata: body.metadata,
    })

    const addresses = getAgentAMPAddresses(agentId)

    return {
      data: { agentId: agent.id, agentName: agent.name || agent.alias, addresses },
      status: 201
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add AMP address'

    if (message.includes('not found')) {
      return { error: message, status: 404 }
    }
    if (message.includes('Invalid AMP') || message.includes('Maximum of 10') || message.includes('already claimed')) {
      return { error: message, status: 400 }
    }

    console.error('Failed to add AMP address:', error)
    return { error: message, status: 500 }
  }
}

// ===========================================================================
// PUBLIC API — Single AMP Address (GET/PATCH/DELETE /api/agents/:id/amp/addresses/:address)
// ===========================================================================

export function getAMPAddress(agentId: string, address: string): ServiceResult<any> {
  try {
    const agent = getAgent(agentId)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    const ampAddress = decodeURIComponent(address).toLowerCase()
    const addresses = getAgentAMPAddresses(agentId)
    const found = addresses.find(a => a.address.toLowerCase() === ampAddress)

    if (!found) {
      return { error: 'AMP address not found', status: 404 }
    }

    return {
      data: { agentId: agent.id, agentName: agent.name || agent.alias, address: found },
      status: 200
    }
  } catch (error) {
    console.error('Failed to get AMP address:', error)
    return { error: 'Failed to get AMP address', status: 500 }
  }
}

export function updateAMPAddressOnAgent(
  agentId: string,
  address: string,
  body: { displayName?: string; primary?: boolean; metadata?: Record<string, string> }
): ServiceResult<any> {
  try {
    const decodedAddress = decodeURIComponent(address)

    const updates: { displayName?: string; primary?: boolean; metadata?: Record<string, string> } = {}
    if ('displayName' in body) updates.displayName = body.displayName
    if ('primary' in body) updates.primary = body.primary
    if ('metadata' in body) updates.metadata = body.metadata

    const agent = updateAMPAddress(agentId, decodedAddress, updates)
    const addresses = getAgentAMPAddresses(agentId)

    return {
      data: { agentId: agent.id, agentName: agent.name || agent.alias, addresses },
      status: 200
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update AMP address'
    if (message.includes('not found')) {
      return { error: message, status: 404 }
    }
    console.error('Failed to update AMP address:', error)
    return { error: message, status: 500 }
  }
}

export function removeAMPAddressFromAgent(agentId: string, address: string): ServiceResult<any> {
  try {
    const decodedAddress = decodeURIComponent(address)

    const agent = removeAMPAddress(agentId, decodedAddress)
    const addresses = getAgentAMPAddresses(agentId)

    return {
      data: { agentId: agent.id, agentName: agent.name || agent.alias, addresses },
      status: 200
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove AMP address'
    if (message.includes('not found')) {
      return { error: message, status: 404 }
    }
    console.error('Failed to remove AMP address:', error)
    return { error: message, status: 500 }
  }
}

// ===========================================================================
// PUBLIC API — Email Addresses (GET/POST /api/agents/:id/email/addresses)
// ===========================================================================

export function listEmailAddresses(agentId: string): ServiceResult<any> {
  try {
    const agent = getAgent(agentId)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    const addresses = getAgentEmailAddresses(agentId)

    return {
      data: { agentId: agent.id, agentName: agent.name || agent.alias, addresses },
      status: 200
    }
  } catch (error) {
    console.error('Failed to get email addresses:', error)
    return { error: 'Failed to get email addresses', status: 500 }
  }
}

export function addEmailAddressToAgent(
  agentId: string,
  body: AddEmailAddressRequest
): ServiceResult<any> {
  try {
    if (!body.address) {
      return { error: 'Email address is required', status: 400 }
    }

    const agent = addEmailAddress(agentId, {
      address: body.address,
      displayName: body.displayName,
      primary: body.primary,
      metadata: body.metadata,
    })

    const addresses = getAgentEmailAddresses(agentId)

    // Emit webhook event (fire and forget)
    const normalizedAddress = body.address.toLowerCase().trim()
    emitEmailChanged(
      agent.id,
      agent.name || agent.alias || 'unknown',
      agent.hostId || 'local',
      [normalizedAddress],
      [],
      addresses.map(a => a.address)
    ).catch(err => console.error('[Webhook] Failed to emit email change:', err))

    return {
      data: { agentId: agent.id, agentName: agent.name || agent.alias, addresses },
      status: 201
    }
  } catch (error) {
    // Check if this is a conflict error
    if (error && typeof error === 'object' && 'error' in error && (error as EmailConflictError).error === 'conflict') {
      return { data: error, status: 409 }
    }

    const message = error instanceof Error ? error.message : 'Failed to add email address'

    if (message.includes('not found')) {
      return { error: message, status: 404 }
    }
    if (message.includes('Invalid email') || message.includes('Maximum of 10') || message.includes('already exists')) {
      return { error: message, status: 400 }
    }

    console.error('Failed to add email address:', error)
    return { error: message, status: 500 }
  }
}

// ===========================================================================
// PUBLIC API — Single Email Address (GET/PATCH/DELETE /api/agents/:id/email/addresses/:address)
// ===========================================================================

export function getEmailAddressDetail(agentId: string, address: string): ServiceResult<any> {
  try {
    const agent = getAgent(agentId)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    const email = decodeURIComponent(address).toLowerCase()
    const addresses = getAgentEmailAddresses(agentId)
    const found = addresses.find(a => a.address.toLowerCase() === email)

    if (!found) {
      return { error: 'Email address not found', status: 404 }
    }

    return {
      data: { agentId: agent.id, agentName: agent.name || agent.alias, address: found },
      status: 200
    }
  } catch (error) {
    console.error('Failed to get email address:', error)
    return { error: 'Failed to get email address', status: 500 }
  }
}

export function updateEmailAddressOnAgent(
  agentId: string,
  address: string,
  body: { displayName?: string; primary?: boolean; metadata?: Record<string, string> }
): ServiceResult<any> {
  try {
    const email = decodeURIComponent(address)

    const updates: { displayName?: string; primary?: boolean; metadata?: Record<string, string> } = {}
    if ('displayName' in body) updates.displayName = body.displayName
    if ('primary' in body) updates.primary = body.primary
    if ('metadata' in body) updates.metadata = body.metadata

    const agent = updateEmailAddress(agentId, email, updates)
    const addresses = getAgentEmailAddresses(agentId)

    return {
      data: { agentId: agent.id, agentName: agent.name || agent.alias, addresses },
      status: 200
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update email address'
    if (message.includes('not found')) {
      return { error: message, status: 404 }
    }
    console.error('Failed to update email address:', error)
    return { error: message, status: 500 }
  }
}

export function removeEmailAddressFromAgent(agentId: string, address: string): ServiceResult<any> {
  try {
    const email = decodeURIComponent(address)
    const normalizedEmail = email.toLowerCase().trim()

    const agent = removeEmailAddress(agentId, email)
    const addresses = getAgentEmailAddresses(agentId)

    // Emit webhook event (fire and forget)
    emitEmailChanged(
      agent.id,
      agent.name || agent.alias || 'unknown',
      agent.hostId || 'local',
      [],
      [normalizedEmail],
      addresses.map(a => a.address)
    ).catch(err => console.error('[Webhook] Failed to emit email change:', err))

    return {
      data: { agentId: agent.id, agentName: agent.name || agent.alias, addresses },
      status: 200
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove email address'
    if (message.includes('not found')) {
      return { error: message, status: 404 }
    }
    console.error('Failed to remove email address:', error)
    return { error: message, status: 500 }
  }
}

// ===========================================================================
// PUBLIC API — Email Index (GET /api/agents/email-index)
// ===========================================================================

export async function queryEmailIndex(
  params: {
    addressQuery?: string | null
    agentIdQuery?: string | null
    federated?: boolean
    isFederatedSubQuery?: boolean
  }
): Promise<ServiceResult<any>> {
  try {
    const { addressQuery, agentIdQuery, federated = false, isFederatedSubQuery = false } = params

    // Federated lookup (query all hosts)
    if (federated && !isFederatedSubQuery) {
      const result = await federatedEmailLookup(addressQuery || undefined)
      return { data: result, status: 200 }
    }

    // Single address lookup (local only)
    if (addressQuery) {
      const agentId = findAgentByEmail(addressQuery)
      if (!agentId) {
        return { data: {}, status: 200 }
      }

      const agent = getAgent(agentId)
      if (!agent) {
        return { data: {}, status: 200 }
      }

      const addresses = getAgentEmailAddresses(agentId)
      const matchingAddr = addresses.find(
        a => a.address.toLowerCase() === addressQuery.toLowerCase()
      )

      if (!matchingAddr) {
        return { data: {}, status: 200 }
      }

      const result: EmailIndexResponse = {
        [matchingAddr.address.toLowerCase()]: {
          agentId: agent.id,
          agentName: agent.name || agent.alias || 'unknown',
          hostId: agent.hostId || 'local',
          hostUrl: getPublicUrl(),
          displayName: matchingAddr.displayName,
          primary: matchingAddr.primary || false,
          metadata: matchingAddr.metadata,
        }
      }

      return { data: result, status: 200 }
    }

    // Get all addresses for a specific agent
    if (agentIdQuery) {
      const agent = getAgent(agentIdQuery)
      if (!agent) {
        return { error: 'Agent not found', status: 404 }
      }

      const addresses = getAgentEmailAddresses(agentIdQuery)
      const result: EmailIndexResponse = {}
      const hostUrl = getPublicUrl()

      for (const addr of addresses) {
        result[addr.address.toLowerCase()] = {
          agentId: agent.id,
          agentName: agent.name || agent.alias || 'unknown',
          hostId: agent.hostId || 'local',
          hostUrl,
          displayName: addr.displayName,
          primary: addr.primary || false,
          metadata: addr.metadata,
        }
      }

      return { data: result, status: 200 }
    }

    // Return full index (local only)
    const index = getEmailIndexFromRegistry()
    const hostUrl = getPublicUrl()

    const enrichedIndex: EmailIndexResponse = {}
    for (const [email, entry] of Object.entries(index)) {
      enrichedIndex[email] = { ...entry, hostUrl }
    }

    return { data: enrichedIndex, status: 200 }
  } catch (error) {
    console.error('Failed to get email index:', error)
    return { error: 'Failed to get email index', status: 500 }
  }
}

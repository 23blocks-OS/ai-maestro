/**
 * Message Delivery - Single local delivery function
 *
 * Both the AMP route (/api/v1/route) and the web UI (/api/messages)
 * call deliver() for local delivery. It does exactly 2 things:
 *   1. Write to the recipient's AMP inbox
 *   2. Send a tmux notification
 *
 * No routing. No resolution. No sent write. No remote. No relay.
 */

import { writeToAMPInbox } from '@/lib/amp-inbox-writer'
import { notifyAgent } from '@/lib/notification-service'
import { applyContentSecurity } from '@/lib/content-security'
import type { AMPEnvelope, AMPPayload } from '@/lib/types/amp'

export interface DeliveryInput {
  envelope: AMPEnvelope
  payload: AMPPayload
  recipientAgentName: string
  senderPublicKeyHex?: string
  // Notification context
  senderName: string
  senderHost?: string
  recipientAgentId?: string
  subject: string
  priority?: string
  messageType?: string
}

export interface DeliveryResult {
  delivered: boolean
  notified: boolean
  error?: string
}

/**
 * Deliver a message locally: write inbox file + send tmux notification.
 */
export async function deliver(input: DeliveryInput): Promise<DeliveryResult> {
  const {
    envelope, payload, recipientAgentName, senderPublicKeyHex,
    senderName, senderHost, recipientAgentId,
    subject, priority, messageType,
  } = input

  // 1a. Apply content security (S6 fix — previously only applied on Web UI path)
  const fromVerified = !!senderPublicKeyHex
  const { content: securedPayload } = applyContentSecurity(
    { type: payload.type, message: payload.message, ...payload.context ? { context: payload.context } : {} },
    fromVerified,
    senderName,
    senderHost
  )
  const securedEnvelopePayload: AMPPayload = { ...payload, message: securedPayload.message }
  if (securedPayload.security) {
    (securedEnvelopePayload as any).security = securedPayload.security
  }

  // 1b. Write to recipient's AMP per-agent inbox
  const inboxPath = await writeToAMPInbox(envelope, securedEnvelopePayload, recipientAgentName, senderPublicKeyHex)
  if (!inboxPath) {
    return { delivered: false, notified: false, error: 'Failed to write to AMP inbox' }
  }

  // 2. Send tmux notification (non-fatal)
  let notified = false
  try {
    const result = await notifyAgent({
      agentId: recipientAgentId,
      agentName: recipientAgentName,
      fromName: senderName,
      fromHost: senderHost || 'unknown',
      subject,
      messageId: envelope.id,
      priority,
      messageType,
    })
    notified = result.notified
  } catch (err) {
    console.warn('[Delivery] Notification failed (non-fatal):', err)
  }

  return { delivered: true, notified }
}

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

import { createHmac } from 'crypto'
import { writeToAMPInbox } from '@/lib/amp-inbox-writer'
import { notifyAgent } from '@/lib/notification-service'
import { applyContentSecurity } from '@/lib/content-security'
import { deliverViaWebSocket, isAgentConnectedViaWS } from '@/lib/amp-websocket'
import { getAgent } from '@/lib/agent-registry'
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

  // 1b. Write to recipient's AMP per-agent inbox (always, for persistence)
  // Disk persistence is the source of truth for "delivered" — WebSocket is supplementary.
  // ALWAYS use UUID for directory resolution - never fall back to agent name
  if (!recipientAgentId) {
    console.error(`[Delivery] No recipientAgentId for ${recipientAgentName} - cannot write inbox`)
    return { delivered: false, notified: false, error: 'No recipient agent UUID' }
  }
  const inboxPath = await writeToAMPInbox(envelope, securedEnvelopePayload, recipientAgentName, senderPublicKeyHex, recipientAgentId)
  if (!inboxPath) {
    return { delivered: false, notified: false, error: 'Failed to write to AMP inbox' }
  }

  // 1c. Try WebSocket delivery (real-time push, supplementary to disk write)
  const recipientAddress = envelope.to
  if (isAgentConnectedViaWS(recipientAddress)) {
    const wsOk = deliverViaWebSocket(recipientAddress, envelope, securedEnvelopePayload, senderPublicKeyHex)
    if (wsOk) {
      console.log(`[Delivery] Also pushed ${envelope.id} via WebSocket to ${recipientAddress}`)
    }
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

  // 3. Webhook delivery (non-fatal, best-effort)
  if (recipientAgentId) {
    const recipientAgent = getAgent(recipientAgentId)
    const webhookUrl = (recipientAgent?.metadata?.amp?.delivery as Record<string, unknown>)?.webhook_url as string | undefined
    if (webhookUrl) {
      deliverViaWebhook(webhookUrl, envelope, securedEnvelopePayload, senderPublicKeyHex).catch((err: unknown) => {
        console.warn(`[Delivery] Webhook delivery failed (non-fatal):`, err)
      })
    }
  }

  return { delivered: true, notified }
}

// ============================================================================
// Webhook Delivery
// ============================================================================

const WEBHOOK_RETRY_DELAYS = [0, 30_000, 120_000] // immediate, 30s, 2min

/**
 * Deliver a message via webhook (best-effort, fire-and-forget with retries).
 * Signs the payload with HMAC-SHA256 using the webhook URL as the key.
 */
async function deliverViaWebhook(
  webhookUrl: string,
  envelope: AMPEnvelope,
  payload: AMPPayload,
  senderPublicKey?: string
): Promise<void> {
  // SSRF prevention: block private IPs
  try {
    const url = new URL(webhookUrl)
    const hostname = url.hostname
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname === '0.0.0.0' ||
      hostname === '::1'
    ) {
      console.warn(`[Delivery] Webhook blocked — private IP: ${hostname}`)
      return
    }
  } catch {
    console.warn(`[Delivery] Invalid webhook URL: ${webhookUrl}`)
    return
  }

  const body = JSON.stringify({ envelope, payload, sender_public_key: senderPublicKey })
  const signature = createHmac('sha256', webhookUrl).update(body).digest('hex')

  for (let attempt = 0; attempt < WEBHOOK_RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, WEBHOOK_RETRY_DELAYS[attempt]))
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      const response = await fetch(webhookUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-AMP-Signature': `sha256=${signature}`,
          'X-AMP-Message-Id': envelope.id,
        },
        body,
      })

      clearTimeout(timeout)

      if (response.ok) {
        console.log(`[Delivery] Webhook delivered ${envelope.id} to ${webhookUrl}`)
        return
      }

      console.warn(`[Delivery] Webhook attempt ${attempt + 1} failed: ${response.status}`)
    } catch (err: unknown) {
      console.warn(`[Delivery] Webhook attempt ${attempt + 1} error:`, err)
    }
  }

  console.error(`[Delivery] Webhook delivery exhausted retries for ${envelope.id}`)
}

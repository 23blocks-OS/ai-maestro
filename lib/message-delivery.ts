/**
 * Message Delivery - Single local delivery function
 *
 * Both the AMP route (/api/v1/route) and the web UI (/api/messages)
 * call deliver() for local delivery:
 *   1. Write to the recipient's AMP inbox (persistence, source of truth)
 *   2. Wake the agent over the best available route — channel, streaming
 *      session, WebSocket, or the tmux pane — and CONFIRM it landed
 *
 * No route may report a delivery it cannot prove. See `verified` on
 * DeliveryResult: a push that merely left our process is not an arrival.
 *
 * No routing. No resolution. No sent write. No remote. No relay.
 */

import { createHmac } from 'crypto'
import { canonicalStringify } from '@/lib/amp-canonical-json'
import { writeToAMPInbox } from '@/lib/amp-inbox-writer'
import { notifyAgent, messageRef } from '@/lib/notification-service'
import { applyContentSecurity } from '@/lib/content-security'
import { deliverViaWebSocket, isAgentConnectedViaWS } from '@/lib/amp-websocket'
import { pushToStreamSession } from '@/lib/streaming-bridge.mjs'
import { pushToChannel, isChannelVerified } from '@/lib/channel-bridge.mjs'
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
  /**
   * True only when the wake was PROVEN to reach the agent: an acknowledged
   * channel, or the notification read back off the pane. `notified` without
   * `verified` means "sent, unconfirmed" — never treat it as proof.
   */
  verified?: boolean
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

  // The wake text used by the streaming and channel injection paths. The tmux
  // path below carries the same sender/subject/body (via notifyAgent's `body`),
  // so every delivery route hands the agent the actual message instead of a
  // pointer to an inbox it has to choose to open.
  const sender = senderHost && senderHost !== 'local' ? `${senderName}@${senderHost}` : senderName
  const injectBody = (securedEnvelopePayload.message || '').toString().slice(0, 2000)
  const injectText =
    `[AMP #${messageRef(envelope.id)}] New message from ${sender}${subject ? ` — "${subject}"` : ''}:\n` +
    `${injectBody}\n\n` +
    `(Reply using the agent-messaging skill, then continue.)`

  // 1d. Push into a live streaming (Agent SDK) session, if the recipient runs
  // in streaming mode. Streaming agents have no tmux pane to notify. Non-fatal.
  try {
    if (pushToStreamSession(recipientAgentId, injectText)) {
      console.log(`[Delivery] Pushed ${envelope.id} into streaming session for ${recipientAgentName}`)
    }
  } catch (err) {
    console.warn('[Delivery] Streaming push failed (non-fatal):', err)
  }

  // 1e. Push into the agent's Channel (MCP turn-injection) if it has one.
  // This is the RELIABLE last-mile: it injects a real turn even on an idle
  // agent, with no tmux keystrokes (no dropped Enter). Every gateway (Slack,
  // Discord, Email, WhatsApp) and agent-to-agent AMP funnels through here, so
  // this one hop makes them all reliable. Falls back to tmux below if the agent
  // has no channel registered (e.g. not relaunched with --channels yet). Non-fatal.
  let channelDelivered = false
  try {
    if (recipientAgentId) {
      channelDelivered = await pushToChannel(recipientAgentId, injectText)
      if (channelDelivered) {
        console.log(`[Delivery] Injected ${envelope.id} via Channel for ${recipientAgentName}`)
      }
    }
  } catch (err) {
    console.warn('[Delivery] Channel push failed (non-fatal):', err)
  }

  // A successful push is NOT proof of delivery: Claude Code never acknowledges
  // channel notifications and silently drops them when the session did not
  // register us as a channel. Only suppress the fallback once the session has
  // proven it receives events (isChannelVerified — see channel-bridge.mjs).
  // Until then both fire; a duplicate nudge is cheap, a lost message is not.
  const channelConfirmed =
    channelDelivered && !!recipientAgentId && isChannelVerified(recipientAgentId)
  if (channelDelivered && !channelConfirmed) {
    console.log(
      `[Delivery] Channel for ${recipientAgentName} is unverified — keeping tmux fallback for ${envelope.id}`
    )
  }

  // 2. Send tmux notification — FALLBACK only. Skipped once the Channel is
  // CONFIRMED to reach the model (no redundant, fragile keystroke wake).
  let notified = channelConfirmed
  let verified = channelConfirmed
  if (!channelConfirmed) {
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
        body: injectBody,
      })
      notified = result.notified
      verified = result.verified === true
    } catch (err) {
      console.warn('[Delivery] Notification failed (non-fatal):', err)
    }
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

  return { delivered: true, notified, verified }
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

  const body = canonicalStringify({ envelope, payload, sender_public_key: senderPublicKey })
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

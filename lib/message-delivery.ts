/**
 * Message Delivery - Single local delivery function
 *
 * Both the AMP route (/api/v1/route) and the web UI (/api/messages)
 * call deliver() for local delivery:
 *   1. Write to the recipient's AMP inbox (persistence, source of truth)
 *   2. Wake the agent via the wake chain (lib/wake-chain.ts) — streaming
 *      session, Claude Code channel, or the tmux pane — and CONFIRM it landed
 *
 * No route may report a delivery it cannot prove. See `verified` on
 * DeliveryResult: a push that merely left our process is not an arrival.
 *
 * No routing. No resolution. No sent write. No remote. No relay.
 */

import { createHmac } from 'crypto'
import { canonicalStringify } from '@/lib/amp-canonical-json'
import { writeToAMPInbox } from '@/lib/amp-inbox-writer'
import { messageRef } from '@/lib/notification-service'
import { applyContentSecurity } from '@/lib/content-security'
import { deliverViaWebSocket, isAgentConnectedViaWS } from '@/lib/amp-websocket'
import { runWakeChain, describeWakeResult } from '@/lib/wake-chain'
import { getAgent } from '@/lib/agent-registry'
import type { AMPEnvelope, AMPPayload } from '@/lib/types/amp'
import type { WakeOutcome } from '@/lib/wake-chain'

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
  /** Which route proved it, when one did. */
  verifiedBy?: string
  /** A wake was queued for the agent's idle transition rather than sent now. */
  deferred?: boolean
  /** Every wake route tried, in order, with its outcome. */
  wakeAttempts?: WakeOutcome[]
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

  // 1c. WebSocket fan-out. NOT a wake route and deliberately outside the chain:
  // ws.send() carries no application-level ack, and these clients are dashboards
  // and AMP libraries rather than the agent's reasoning loop. Always fires.
  const recipientAddress = envelope.to
  if (isAgentConnectedViaWS(recipientAddress)) {
    const wsOk = deliverViaWebSocket(recipientAddress, envelope, securedEnvelopePayload, senderPublicKeyHex)
    if (wsOk) {
      console.log(`[Delivery] Also pushed ${envelope.id} via WebSocket to ${recipientAddress}`)
    }
  }

  // The wake text. Every route in the chain carries the same sender/subject/
  // body — the pane route re-wraps `injectBody` under its own header — so no
  // route hands the agent a bare "check your inbox" pointer it could ignore.
  const sender = senderHost && senderHost !== 'local' ? `${senderName}@${senderHost}` : senderName
  const injectBody = (securedEnvelopePayload.message || '').toString().slice(0, 2000)
  const injectText =
    `[AMP #${messageRef(envelope.id)}] New message from ${sender}${subject ? ` — "${subject}"` : ''}:\n` +
    `${injectBody}\n\n` +
    `(Reply using the agent-messaging skill, then continue.)`

  // 2. Wake the agent. The chain tries each route in preference order and stops
  // at the first one that can PROVE arrival — see lib/wake-chain.ts for why an
  // unproven "sent" must not stop it. Every route is attempted in-process; the
  // chain itself is non-fatal, since the inbox write above already succeeded.
  const wake = await runWakeChain({
    agentId: recipientAgentId,
    agentName: recipientAgentName,
    injectText,
    injectBody,
    senderName,
    senderHost,
    subject,
    messageId: envelope.id,
    priority,
    messageType,
  })

  const notified = wake.notified
  const verified = wake.confirmed

  if (wake.confirmed) {
    console.log(
      `[Delivery] ${envelope.id} → ${recipientAgentName} confirmed via ${wake.confirmedBy} (${describeWakeResult(wake)})`
    )
  } else if (wake.deferred) {
    // The pane was mid-render, so the wake is queued for the idle transition
    // rather than typed into the churn. Not a loss — a delay — but not an
    // arrival either.
    console.log(
      `[Delivery] ${envelope.id} → ${recipientAgentName} deferred to idle (${describeWakeResult(wake)})`
    )
  } else {
    // Nothing could prove it landed. The message is safely on disk, but no
    // agent is known to have seen it — log loudly enough to be actionable.
    console.warn(
      `[Delivery] ${envelope.id} → ${recipientAgentName} UNCONFIRMED (${describeWakeResult(wake)})`
    )
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

  return {
    delivered: true,
    notified,
    verified,
    ...(wake.confirmedBy ? { verifiedBy: wake.confirmedBy } : {}),
    ...(wake.deferred ? { deferred: true } : {}),
    wakeAttempts: wake.attempts,
  }
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

import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import type {
  WebhookSubscription,
  WebhookEventType,
  CreateWebhookRequest,
  WebhookEmailChangedPayload,
  WebhookAgentPayload,
} from '@/types/agent'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const WEBHOOKS_FILE = path.join(AIMAESTRO_DIR, 'webhooks.json')

// ============================================================================
// Storage
// ============================================================================

/**
 * Ensure aimaestro directory exists
 */
function ensureDir() {
  if (!fs.existsSync(AIMAESTRO_DIR)) {
    fs.mkdirSync(AIMAESTRO_DIR, { recursive: true })
  }
}

/**
 * Generate a secure random secret for webhook signing
 */
function generateSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`
}

/**
 * Load all webhook subscriptions
 */
export function loadWebhooks(): WebhookSubscription[] {
  try {
    ensureDir()

    if (!fs.existsSync(WEBHOOKS_FILE)) {
      return []
    }

    const data = fs.readFileSync(WEBHOOKS_FILE, 'utf-8')
    const webhooks = JSON.parse(data)

    return Array.isArray(webhooks) ? webhooks : []
  } catch (error) {
    console.error('[Webhooks] Failed to load webhooks:', error)
    return []
  }
}

/**
 * Save webhook subscriptions
 */
export function saveWebhooks(webhooks: WebhookSubscription[]): boolean {
  try {
    ensureDir()

    const data = JSON.stringify(webhooks, null, 2)
    fs.writeFileSync(WEBHOOKS_FILE, data, 'utf-8')

    return true
  } catch (error) {
    console.error('[Webhooks] Failed to save webhooks:', error)
    return false
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get webhook by ID
 */
export function getWebhook(id: string): WebhookSubscription | null {
  const webhooks = loadWebhooks()
  return webhooks.find(w => w.id === id) || null
}

/**
 * Create a new webhook subscription
 */
export function createWebhook(request: CreateWebhookRequest): WebhookSubscription {
  const webhooks = loadWebhooks()

  // Check for duplicate URL + events combination
  const existingWithSameUrl = webhooks.find(w =>
    w.url === request.url &&
    JSON.stringify(w.events.sort()) === JSON.stringify(request.events.sort())
  )

  if (existingWithSameUrl) {
    throw new Error('Webhook subscription with same URL and events already exists')
  }

  const webhook: WebhookSubscription = {
    id: uuidv4(),
    url: request.url,
    events: request.events,
    secret: request.secret || generateSecret(),
    description: request.description,
    status: 'active',
    createdAt: new Date().toISOString(),
    failureCount: 0,
  }

  webhooks.push(webhook)
  saveWebhooks(webhooks)

  return webhook
}

/**
 * Delete a webhook subscription
 */
export function deleteWebhook(id: string): boolean {
  const webhooks = loadWebhooks()
  const index = webhooks.findIndex(w => w.id === id)

  if (index === -1) {
    return false
  }

  webhooks.splice(index, 1)
  return saveWebhooks(webhooks)
}

/**
 * List all webhooks
 */
export function listWebhooks(): WebhookSubscription[] {
  return loadWebhooks()
}

/**
 * Update webhook delivery status
 */
export function updateWebhookDeliveryStatus(
  id: string,
  success: boolean
): void {
  const webhooks = loadWebhooks()
  const index = webhooks.findIndex(w => w.id === id)

  if (index === -1) return

  webhooks[index].lastDeliveryAt = new Date().toISOString()
  webhooks[index].lastDeliveryStatus = success ? 'success' : 'failed'

  if (success) {
    webhooks[index].failureCount = 0
  } else {
    webhooks[index].failureCount = (webhooks[index].failureCount || 0) + 1
  }

  saveWebhooks(webhooks)
}

// ============================================================================
// Webhook Delivery
// ============================================================================

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
}

/**
 * Deliver a webhook payload to a subscriber
 */
async function deliverWebhook(
  webhook: WebhookSubscription,
  payload: WebhookEmailChangedPayload | WebhookAgentPayload
): Promise<boolean> {
  try {
    const payloadString = JSON.stringify(payload)
    const signature = generateSignature(payloadString, webhook.secret)

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': payload.event,
        'X-Webhook-Id': webhook.id,
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    })

    const success = response.ok
    updateWebhookDeliveryStatus(webhook.id, success)

    if (!success) {
      console.error(`[Webhooks] Delivery failed to ${webhook.url}: ${response.status}`)
    } else {
      console.log(`[Webhooks] Delivered ${payload.event} to ${webhook.url}`)
    }

    return success
  } catch (error) {
    console.error(`[Webhooks] Delivery error to ${webhook.url}:`, error)
    updateWebhookDeliveryStatus(webhook.id, false)
    return false
  }
}

/**
 * Emit an event to all subscribed webhooks
 */
export async function emitWebhookEvent(
  payload: WebhookEmailChangedPayload | WebhookAgentPayload
): Promise<void> {
  const webhooks = loadWebhooks()

  // Find webhooks subscribed to this event
  const subscribers = webhooks.filter(w =>
    w.events.includes(payload.event as WebhookEventType)
  )

  if (subscribers.length === 0) {
    return
  }

  console.log(`[Webhooks] Emitting ${payload.event} to ${subscribers.length} subscriber(s)`)

  // Deliver in parallel (fire-and-forget for now)
  await Promise.allSettled(
    subscribers.map(webhook => deliverWebhook(webhook, payload))
  )
}

// ============================================================================
// Event Helpers
// ============================================================================

/**
 * Emit email changed event
 */
export async function emitEmailChanged(
  agentId: string,
  agentName: string,
  hostId: string,
  added: string[],
  removed: string[],
  current: string[]
): Promise<void> {
  const payload: WebhookEmailChangedPayload = {
    event: 'agent.email.changed',
    timestamp: new Date().toISOString(),
    agent: {
      id: agentId,
      name: agentName,
      hostId,
    },
    changes: {
      added,
      removed,
      current,
    },
  }

  await emitWebhookEvent(payload)
}

/**
 * Emit agent lifecycle event
 */
export async function emitAgentEvent(
  event: 'agent.created' | 'agent.deleted' | 'agent.updated',
  agentId: string,
  agentName: string,
  hostId: string
): Promise<void> {
  const payload: WebhookAgentPayload = {
    event,
    timestamp: new Date().toISOString(),
    agent: {
      id: agentId,
      name: agentName,
      hostId,
    },
  }

  await emitWebhookEvent(payload)
}

/**
 * Send a test webhook to verify connectivity
 */
export async function sendTestWebhook(webhookId: string): Promise<boolean> {
  const webhook = getWebhook(webhookId)

  if (!webhook) {
    throw new Error('Webhook not found')
  }

  const testPayload: WebhookAgentPayload = {
    event: 'agent.updated',
    timestamp: new Date().toISOString(),
    agent: {
      id: 'test-agent-id',
      name: 'test-agent',
      hostId: 'test-host',
    },
  }

  return await deliverWebhook(webhook, testPayload)
}

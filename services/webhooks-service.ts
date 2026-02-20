/**
 * Webhooks Service
 *
 * Pure business logic extracted from app/api/webhooks/** routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/webhooks           -> listAllWebhooks
 *   POST   /api/webhooks           -> createNewWebhook
 *   GET    /api/webhooks/[id]      -> getWebhookById
 *   DELETE /api/webhooks/[id]      -> deleteWebhookById
 *   POST   /api/webhooks/[id]/test -> testWebhookById
 */

import {
  listWebhooks,
  createWebhook,
  getWebhook,
  deleteWebhook,
  sendTestWebhook,
} from '@/lib/webhook-service'
import type { CreateWebhookRequest, WebhookEventType } from '@/types/agent'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number  // HTTP-like status code for the route to use
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_EVENTS: WebhookEventType[] = [
  'agent.email.changed',
  'agent.created',
  'agent.deleted',
  'agent.updated',
]

// ===========================================================================
// PUBLIC API -- called by API routes
// ===========================================================================

/**
 * List all webhook subscriptions (secrets stripped).
 */
export function listAllWebhooks(): ServiceResult<{ webhooks: any[] }> {
  try {
    const webhooks = listWebhooks()

    // Don't expose secrets in list response
    const sanitized = webhooks.map(w => ({
      id: w.id,
      url: w.url,
      events: w.events,
      description: w.description,
      status: w.status || 'active',
      createdAt: w.createdAt,
      lastDeliveryAt: w.lastDeliveryAt,
      lastDeliveryStatus: w.lastDeliveryStatus,
      failureCount: w.failureCount,
    }))

    return { data: { webhooks: sanitized }, status: 200 }
  } catch (error) {
    console.error('Failed to list webhooks:', error)
    return { error: 'Failed to list webhooks', status: 500 }
  }
}

/**
 * Create a new webhook subscription.
 * Returns the secret ONLY on creation.
 */
export function createNewWebhook(body: CreateWebhookRequest): ServiceResult<{ webhook: any; message?: string }> {
  // Validate required fields
  if (!body.url) {
    return { error: 'URL is required', status: 400 }
  }

  if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
    return { error: 'At least one event is required', status: 400 }
  }

  // Validate URL format
  try {
    new URL(body.url)
  } catch {
    return { error: 'Invalid URL format', status: 400 }
  }

  // Validate event types
  for (const event of body.events) {
    if (!VALID_EVENTS.includes(event)) {
      return { error: `Invalid event type: ${event}. Valid events: ${VALID_EVENTS.join(', ')}`, status: 400 }
    }
  }

  try {
    const webhook = createWebhook(body)

    // Return secret ONLY on creation - user must save it now
    return {
      data: {
        webhook: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          description: webhook.description,
          secret: webhook.secret,  // Only exposed on creation!
          createdAt: webhook.createdAt,
        },
        message: 'Webhook created. Save the secret - it will not be shown again.',
      },
      status: 201,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create webhook'

    if (message.includes('already exists')) {
      return { error: message, status: 409 }
    }

    console.error('Failed to create webhook:', error)
    return { error: message, status: 500 }
  }
}

/**
 * Get a specific webhook by ID (secret stripped).
 */
export function getWebhookById(id: string): ServiceResult<any> {
  try {
    const webhook = getWebhook(id)

    if (!webhook) {
      return { error: 'Webhook not found', status: 404 }
    }

    // Don't expose secret
    return {
      data: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        createdAt: webhook.createdAt,
        lastDeliveryAt: webhook.lastDeliveryAt,
        lastDeliveryStatus: webhook.lastDeliveryStatus,
        failureCount: webhook.failureCount,
      },
      status: 200,
    }
  } catch (error) {
    console.error('Failed to get webhook:', error)
    return { error: 'Failed to get webhook', status: 500 }
  }
}

/**
 * Delete a webhook by ID.
 */
export function deleteWebhookById(id: string): ServiceResult<{ success: boolean }> {
  try {
    const success = deleteWebhook(id)

    if (!success) {
      return { error: 'Webhook not found', status: 404 }
    }

    return { data: { success: true }, status: 200 }
  } catch (error) {
    console.error('Failed to delete webhook:', error)
    return { error: 'Failed to delete webhook', status: 500 }
  }
}

/**
 * Send a test webhook to verify connectivity.
 */
export async function testWebhookById(id: string): Promise<ServiceResult<{ success: boolean; message: string }>> {
  try {
    const success = await sendTestWebhook(id)

    return {
      data: {
        success,
        message: success
          ? 'Test webhook delivered successfully'
          : 'Test webhook delivery failed',
      },
      status: 200,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send test webhook'

    if (message.includes('not found')) {
      return { error: message, status: 404 }
    }

    console.error('Failed to send test webhook:', error)
    return { error: message, status: 500 }
  }
}

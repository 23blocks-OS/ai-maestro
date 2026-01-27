import { NextResponse } from 'next/server'
import {
  listWebhooks,
  createWebhook,
} from '@/lib/webhook-service'
import type { CreateWebhookRequest, WebhookEventType } from '@/types/agent'

const VALID_EVENTS: WebhookEventType[] = [
  'agent.email.changed',
  'agent.created',
  'agent.deleted',
  'agent.updated',
]

/**
 * GET /api/webhooks
 * List all webhook subscriptions
 */
export async function GET() {
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

    return NextResponse.json({ webhooks: sanitized })
  } catch (error) {
    console.error('Failed to list webhooks:', error)
    return NextResponse.json(
      { error: 'Failed to list webhooks' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/webhooks
 * Create a new webhook subscription
 *
 * Request body:
 * {
 *   "url": "https://example.com/webhook",
 *   "events": ["agent.email.changed"],
 *   "description": "optional description"
 * }
 *
 * Secret is auto-generated and returned ONLY in the creation response.
 */
export async function POST(request: Request) {
  try {
    const body: CreateWebhookRequest = await request.json()

    // Validate required fields
    if (!body.url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json(
        { error: 'At least one event is required' },
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(body.url)
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Validate event types
    for (const event of body.events) {
      if (!VALID_EVENTS.includes(event)) {
        return NextResponse.json(
          { error: `Invalid event type: ${event}. Valid events: ${VALID_EVENTS.join(', ')}` },
          { status: 400 }
        )
      }
    }

    const webhook = createWebhook(body)

    // Return secret ONLY on creation - user must save it now
    return NextResponse.json(
      {
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
      { status: 201 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create webhook'

    if (message.includes('already exists')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }

    console.error('Failed to create webhook:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

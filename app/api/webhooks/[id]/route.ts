import { NextResponse } from 'next/server'
import {
  getWebhook,
  deleteWebhook,
} from '@/lib/webhook-service'

/**
 * GET /api/webhooks/[id]
 * Get a specific webhook subscription
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const webhook = getWebhook(params.id)

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    // Don't expose secret
    return NextResponse.json({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      createdAt: webhook.createdAt,
      lastDeliveryAt: webhook.lastDeliveryAt,
      lastDeliveryStatus: webhook.lastDeliveryStatus,
      failureCount: webhook.failureCount,
    })
  } catch (error) {
    console.error('Failed to get webhook:', error)
    return NextResponse.json(
      { error: 'Failed to get webhook' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/webhooks/[id]
 * Unsubscribe / delete a webhook
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const success = deleteWebhook(params.id)

    if (!success) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete webhook:', error)
    return NextResponse.json(
      { error: 'Failed to delete webhook' },
      { status: 500 }
    )
  }
}

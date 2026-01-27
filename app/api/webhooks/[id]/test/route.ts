import { NextResponse } from 'next/server'
import { sendTestWebhook } from '@/lib/webhook-service'

/**
 * POST /api/webhooks/[id]/test
 * Send a test webhook to verify connectivity
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const success = await sendTestWebhook(params.id)

    return NextResponse.json({
      success,
      message: success
        ? 'Test webhook delivered successfully'
        : 'Test webhook delivery failed',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send test webhook'

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }

    console.error('Failed to send test webhook:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

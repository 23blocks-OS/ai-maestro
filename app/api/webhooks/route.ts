import { NextResponse } from 'next/server'
import { listAllWebhooks, createNewWebhook } from '@/services/webhooks-service'

/**
 * GET /api/webhooks
 * List all webhook subscriptions
 */
export async function GET() {
  const result = listAllWebhooks()

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * POST /api/webhooks
 * Create a new webhook subscription
 */
export async function POST(request: Request) {
  const body = await request.json()
  const result = createNewWebhook(body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

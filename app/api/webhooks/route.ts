import { NextRequest, NextResponse } from 'next/server'
import { listAllWebhooks, createNewWebhook } from '@/services/webhooks-service'
import { authenticateAgent } from '@/lib/agent-auth'

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
 * Requires authentication to prevent unauthorized webhook creation (MF-003)
 */
export async function POST(request: NextRequest) {
  // Authenticate -- webhook creation is a write path that can trigger HTTP requests to arbitrary URLs
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = createNewWebhook(body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

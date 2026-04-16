import { listAllWebhooks, createNewWebhook } from '@/services/webhooks-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/webhooks
 * List all webhook subscriptions
 */
export async function GET() {
  const result = listAllWebhooks()
  return toResponse(result)
}

/**
 * POST /api/webhooks
 * Create a new webhook subscription
 */
export async function POST(request: Request) {
  const body = await request.json()
  const result = createNewWebhook(body)
  return toResponse(result)
}

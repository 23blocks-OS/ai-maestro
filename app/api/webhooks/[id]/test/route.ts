import { testWebhookById } from '@/services/webhooks-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * POST /api/webhooks/[id]/test
 * Send a test webhook to verify connectivity
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await testWebhookById(id)
  return toResponse(result)
}

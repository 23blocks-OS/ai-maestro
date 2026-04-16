import { getWebhookById, deleteWebhookById } from '@/services/webhooks-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/webhooks/[id]
 * Get a specific webhook subscription
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = getWebhookById(id)
  return toResponse(result)
}

/**
 * DELETE /api/webhooks/[id]
 * Unsubscribe / delete a webhook
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = deleteWebhookById(id)
  return toResponse(result)
}

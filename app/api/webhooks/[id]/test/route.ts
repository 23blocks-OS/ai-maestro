import { NextResponse } from 'next/server'
import { testWebhookById } from '@/services/webhooks-service'

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

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

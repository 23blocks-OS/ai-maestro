/**
 * AMP v1 Pending Message by ID
 *
 * DELETE /api/v1/messages/pending/:id
 *
 * Path-param variant of DELETE /api/v1/messages/pending?id=X
 * Both are supported for client compatibility.
 */

import { NextRequest } from 'next/server'
import { acknowledgePendingMessage } from '@/services/amp-service'
import { toResponse } from '@/app/api/_helpers'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = request.headers.get('Authorization')
  const { id } = await params

  const result = acknowledgePendingMessage(authHeader, id)
  return toResponse(result)
}

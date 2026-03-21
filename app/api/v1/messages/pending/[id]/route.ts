/**
 * AMP v1 Pending Message by ID
 *
 * DELETE /api/v1/messages/pending/:id
 *
 * Path-param variant of DELETE /api/v1/messages/pending?id=X
 * Both are supported for client compatibility.
 */

import { NextRequest, NextResponse } from 'next/server'
import { acknowledgePendingMessage } from '@/services/amp-service'
import type { AMPError } from '@/lib/types/amp'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ acknowledged: boolean } | AMPError>> {
  const authHeader = request.headers.get('Authorization')
  const { id } = await params

  const result = acknowledgePendingMessage(authHeader, id)
  return NextResponse.json(result.data!, { status: result.status })
}

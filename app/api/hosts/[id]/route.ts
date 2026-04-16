import { NextRequest } from 'next/server'
import { updateExistingHost, deleteExistingHost } from '@/services/hosts-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/hosts/[id]
 *
 * Update an existing host configuration.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hostData = await request.json()

  const result = await updateExistingHost(id, hostData)
  return toResponse(result)
}

/**
 * DELETE /api/hosts/[id]
 *
 * Delete a host from the configuration.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await deleteExistingHost(id)
  return toResponse(result)
}

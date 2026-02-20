import { NextRequest, NextResponse } from 'next/server'
import { updateExistingHost, deleteExistingHost } from '@/services/hosts-service'

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
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
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
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

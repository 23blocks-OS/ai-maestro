import { NextRequest, NextResponse } from 'next/server'
import { updateExistingHost, deleteExistingHost } from '@/services/hosts-service'

export const dynamic = 'force-dynamic'

/** NT-040: Hostname format validation for path params (alphanumeric start/end, dots/hyphens/underscores, 1-253 chars) */
const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,251}[a-zA-Z0-9])?$/

/**
 * PUT /api/hosts/[id]
 *
 * Update an existing host configuration.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!HOSTNAME_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid host id format' }, { status: 400 })
    }

    let hostData
    try { hostData = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await updateExistingHost(id, hostData)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (err) {
    return NextResponse.json({ error: `Internal server error: ${(err as Error).message}` }, { status: 500 })
  }
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
  try {
    const { id } = await params
    if (!HOSTNAME_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid host id format' }, { status: 400 })
    }

    const result = await deleteExistingHost(id)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (err) {
    return NextResponse.json({ error: `Internal server error: ${(err as Error).message}` }, { status: 500 })
  }
}

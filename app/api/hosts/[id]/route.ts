import { NextResponse } from 'next/server'
import { updateHost, deleteHost } from '@/lib/hosts-config'
import type { Host } from '@/types/host'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/hosts/[id]
 *
 * Update an existing host configuration.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const host: Partial<Host> = await request.json()

    // Validate URL if provided
    if (host.url) {
      try {
        new URL(host.url)
      } catch {
        return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
      }
    }

    // Update host
    const result = updateHost(id, host)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.error?.includes('not found') ? 404 : 400 })
    }

    return NextResponse.json({ success: true, host: result.host })
  } catch (error) {
    console.error(`[Hosts API] Failed to update host:`, error)
    return NextResponse.json({ error: 'Failed to update host' }, { status: 500 })
  }
}

/**
 * DELETE /api/hosts/[id]
 *
 * Delete a host from the configuration.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Delete host
    const result = deleteHost(id)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.error?.includes('not found') ? 404 : 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`[Hosts API] Failed to delete host:`, error)
    return NextResponse.json({ error: 'Failed to delete host' }, { status: 500 })
  }
}

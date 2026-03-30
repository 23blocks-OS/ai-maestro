import { NextRequest, NextResponse } from 'next/server'
import { getGroupById, updateGroupById, deleteGroupById } from '@/services/groups-service'

// GET /api/groups/[id] - Get a single group
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = getGroupById(id)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

// PUT /api/groups/[id] - Update a group
// Accepts { name?, description?, subscriberIds? }
// No governance/authentication checks -- groups are open
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, description, subscriberIds } = body

  const result = await updateGroupById(id, { name, description, subscriberIds })
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

// DELETE /api/groups/[id] - Delete a group
// No governance/authentication checks -- groups are open
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await deleteGroupById(id)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

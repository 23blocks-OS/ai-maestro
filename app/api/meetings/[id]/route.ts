import { NextRequest, NextResponse } from 'next/server'
import { getMeetingById, updateExistingMeeting, deleteExistingMeeting } from '@/services/messages-service'
import { authenticateAgent } from '@/lib/agent-auth'
import { isValidUuid } from '@/lib/validation'

// GET /api/meetings/[id] - Get a single meeting
// SF-014 (P8): Authenticate agent for read operations, consistent with PATCH/DELETE
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // MF-007: Validate UUID format for meeting ID
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid meeting ID format' }, { status: 400 })
  }
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }
  const result = getMeetingById(id)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

// PATCH /api/meetings/[id] - Update a meeting
// SF-013: Authenticate agent for write operations (consistent with team-related routes)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // MF-007: Validate UUID format for meeting ID
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid meeting ID format' }, { status: 400 })
  }
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }
  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = updateExistingMeeting(id, body)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

// DELETE /api/meetings/[id] - Delete a meeting
// SF-013: Authenticate agent for write operations (consistent with team-related routes)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // MF-007: Validate UUID format for meeting ID
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid meeting ID format' }, { status: 400 })
  }
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }
  const result = deleteExistingMeeting(id)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

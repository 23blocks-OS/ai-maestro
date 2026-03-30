import { NextRequest, NextResponse } from 'next/server'
import { unsubscribeAgent } from '@/services/groups-service'

// POST /api/groups/[id]/unsubscribe - Unsubscribe an agent from a group
// Body: { agentId: string }
// No governance/authentication checks -- groups are open
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { agentId } = body
  if (!agentId || typeof agentId !== 'string') {
    return NextResponse.json({ error: 'agentId is required and must be a string' }, { status: 400 })
  }

  const result = await unsubscribeAgent(groupId, agentId)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

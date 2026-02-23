import { NextRequest, NextResponse } from 'next/server'
import { listMeetings, createNewMeeting } from '@/services/messages-service'
import { authenticateAgent } from '@/lib/agent-auth'

// NT-009: Force dynamic -- reads runtime filesystem state (meeting registry)
export const dynamic = 'force-dynamic'

// GET /api/meetings - List all meetings (optional ?status=active filter)
export async function GET(request: NextRequest) {
  const result = listMeetings(request.nextUrl.searchParams.get('status'))
  // SF-010 fix: Use explicit error check instead of ?? which can swallow errors
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

// POST /api/meetings - Create a new meeting
// SF-013: Authenticate agent for write operations (consistent with team-related routes)
export async function POST(request: NextRequest) {
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
  const result = createNewMeeting(body)
  // SF-010 fix: Use explicit error check instead of ?? which can swallow errors
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

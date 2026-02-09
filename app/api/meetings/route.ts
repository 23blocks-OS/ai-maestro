import { NextRequest, NextResponse } from 'next/server'
import { loadMeetings, createMeeting } from '@/lib/meeting-registry'

// GET /api/meetings - List all meetings (optional ?status=active filter)
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status')
  let meetings = loadMeetings()
  if (status) {
    meetings = meetings.filter(m => m.status === status)
  }
  return NextResponse.json({ meetings })
}

// POST /api/meetings - Create a new meeting
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, agentIds, teamId, sidebarMode } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Meeting name is required' }, { status: 400 })
    }

    if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json({ error: 'At least one agent is required' }, { status: 400 })
    }

    const meeting = createMeeting({
      name,
      agentIds,
      teamId: teamId || null,
      sidebarMode,
    })
    return NextResponse.json({ meeting }, { status: 201 })
  } catch (error) {
    console.error('Failed to create meeting:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create meeting' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { listMeetings, createNewMeeting } from '@/services/messages-service'

// GET /api/meetings - List all meetings (optional ?status=active filter)
export async function GET(request: NextRequest) {
  const result = listMeetings(request.nextUrl.searchParams.get('status'))
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}

// POST /api/meetings - Create a new meeting
export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = createNewMeeting(body)
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}

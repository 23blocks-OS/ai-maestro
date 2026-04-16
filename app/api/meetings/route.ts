import { NextRequest } from 'next/server'
import { listMeetings, createNewMeeting } from '@/services/messages-service'
import { toResponse } from '@/app/api/_helpers'

// GET /api/meetings - List all meetings (optional ?status=active filter)
export async function GET(request: NextRequest) {
  const result = listMeetings(request.nextUrl.searchParams.get('status'))
  return toResponse(result)
}

// POST /api/meetings - Create a new meeting
export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = createNewMeeting(body)
  return toResponse(result)
}

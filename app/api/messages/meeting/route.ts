import { NextRequest, NextResponse } from 'next/server'
import { getMeetingMessages } from '@/services/messages-service'

/**
 * GET /api/messages/meeting?meetingId=<id>&participants=<id1,id2,...>&since=<timestamp>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // SF-002: Validate that at least meetingId is provided
  const meetingId = searchParams.get('meetingId')
  if (!meetingId) {
    return NextResponse.json({ error: 'meetingId query parameter is required' }, { status: 400 })
  }

  const result = await getMeetingMessages({
    meetingId,
    participants: searchParams.get('participants'),
    since: searchParams.get('since'),
  })
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

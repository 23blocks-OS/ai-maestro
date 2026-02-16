import { NextRequest, NextResponse } from 'next/server'
import { getMeetingMessages } from '@/services/messages-service'

/**
 * GET /api/messages/meeting?meetingId=<id>&participants=<id1,id2,...>&since=<timestamp>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await getMeetingMessages({
    meetingId: searchParams.get('meetingId'),
    participants: searchParams.get('participants'),
    since: searchParams.get('since'),
  })
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}

import { NextRequest } from 'next/server'
import { getMeetingMessages } from '@/services/messages-service'
import { toResponse } from '@/app/api/_helpers'

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
  return toResponse(result)
}

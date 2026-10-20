import { NextRequest } from 'next/server'
import { broadcastToMeeting } from '@/services/meeting-broadcast-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * POST /api/meetings/[id]/broadcast
 * Body: { message, participantIds, teamName?, recipients? }
 * Sends to every participant (or only `recipients`, for a retry) and answers with one result per agent.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(await broadcastToMeeting({
    meetingId: id,
    message: body.message,
    participantIds: body.participantIds,
    teamName: body.teamName,
    recipients: body.recipients,
  }))
}

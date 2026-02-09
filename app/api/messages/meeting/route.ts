import { NextRequest, NextResponse } from 'next/server'
import { listInboxMessages, listSentMessages } from '@/lib/messageQueue'
import type { MessageSummary } from '@/lib/messageQueue'

/**
 * GET /api/messages/meeting?meetingId=<id>&participants=<id1,id2,...>&since=<timestamp>
 *
 * Aggregates messages across all participant inboxes + sent folders,
 * filtered by meetingId in the message context.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const meetingId = searchParams.get('meetingId')
  const participantsParam = searchParams.get('participants')
  const since = searchParams.get('since')

  if (!meetingId) {
    return NextResponse.json({ error: 'meetingId is required' }, { status: 400 })
  }
  if (!participantsParam) {
    return NextResponse.json({ error: 'participants is required' }, { status: 400 })
  }

  const participantIds = participantsParam.split(',').filter(Boolean)
  // Include 'maestro' as a pseudo-participant
  const allParticipants = [...new Set([...participantIds, 'maestro'])]

  const seenIds = new Set<string>()
  const meetingMessages: MessageSummary[] = []

  // Fetch inbox and sent for each participant
  for (const participantId of allParticipants) {
    try {
      const [inbox, sent] = await Promise.all([
        listInboxMessages(participantId, { limit: 0, previewLength: 2000 }),
        listSentMessages(participantId, { limit: 0, previewLength: 2000 }),
      ])

      const allMessages = [...inbox, ...sent]

      for (const msg of allMessages) {
        if (seenIds.has(msg.id)) continue
        // Check if message belongs to this meeting (subject prefix or context tag)
        if (msg.subject.startsWith(`[MEETING:${meetingId}]`)) {
          if (since && new Date(msg.timestamp) <= new Date(since)) continue
          seenIds.add(msg.id)
          meetingMessages.push(msg)
        }
      }
    } catch {
      // Skip participants that can't be resolved
    }
  }

  // Sort chronologically (oldest first for chat display)
  meetingMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  // Deduplicate broadcast messages: same sender + same preview + similar timestamp → keep one
  const deduped: MessageSummary[] = []
  const broadcastSeen = new Set<string>()
  for (const msg of meetingMessages) {
    // Create a key from sender + preview + second-level timestamp
    const ts = msg.timestamp.slice(0, 19) // trim to second precision
    const dedupeKey = `${msg.from}|${msg.preview}|${ts}`
    if (broadcastSeen.has(dedupeKey)) continue
    broadcastSeen.add(dedupeKey)
    deduped.push(msg)
  }

  return NextResponse.json({
    meetingId,
    messages: deduped,
    count: deduped.length,
  })
}

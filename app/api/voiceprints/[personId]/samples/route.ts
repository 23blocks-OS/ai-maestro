/** POST /api/voiceprints/[personId]/samples: { name, agentId, deviceKey, index, consent } records one sentence at the kiosk. */
import { NextRequest } from 'next/server'
import { cancelVoiceSample, recordVoiceSample } from '@/services/voiceprints-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ personId: string }> }) {
  return toResponse(await recordVoiceSample((await params).personId, await req.json().catch(() => ({}))))
}

/** DELETE: cancels the enrollment in progress (and a board's wait for the next clip) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ personId: string }> }) {
  return toResponse(await cancelVoiceSample((await params).personId))
}

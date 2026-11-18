/** GET /api/voiceprints: who is enrolled on this host, and the consent text. PUT { consentText }. */
import { NextRequest } from 'next/server'
import { voiceprintStatus, updateConsentText } from '@/services/voiceprints-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  return toResponse(voiceprintStatus())
}

export async function PUT(req: NextRequest) {
  return toResponse(updateConsentText(await req.json().catch(() => ({}))))
}

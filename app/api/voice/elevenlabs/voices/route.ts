/** GET /api/voice/elevenlabs/voices: the voices this host's key can use. */
import { NextResponse } from 'next/server'
import { elevenLabsVoices } from '@/services/agent-speech-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await elevenLabsVoices()
  return NextResponse.json(result.data, { status: result.status })
}

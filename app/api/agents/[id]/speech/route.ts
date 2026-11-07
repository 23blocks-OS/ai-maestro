/** POST /api/agents/[id]/speech: { text }, the agent's own voice as a WAV. */
import { NextRequest, NextResponse } from 'next/server'
import { speakForAgent } from '@/services/agent-speech-service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await speakForAgent(id, await req.json().catch(() => ({})))
  const audio = (result.data as { audio?: Buffer } | undefined)?.audio
  if (!audio) return NextResponse.json(result.data, { status: result.status })
  return new NextResponse(new Uint8Array(audio), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } })
}

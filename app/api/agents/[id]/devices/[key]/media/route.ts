/** POST /api/agents/[id]/devices/[key]/media: { kind, seconds }, a bounded capture saved as a file. */
import { NextRequest } from 'next/server'
import { captureAgentDevice } from '@/services/agent-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params
  return toResponse(await captureAgentDevice(id, key, await req.json().catch(() => ({}))))
}

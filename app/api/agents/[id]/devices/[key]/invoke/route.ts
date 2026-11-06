/** POST /api/agents/[id]/devices/[key]/invoke: { capability, args }. The closed list is the protocol's. */
import { NextRequest } from 'next/server'
import { invokeAgentDevice } from '@/services/agent-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params
  return toResponse(await invokeAgentDevice(id, key, await req.json().catch(() => ({}))))
}

/** POST /api/agents/[id]/devices/[key]/refresh: ask the device again who owns it. */
import { NextRequest } from 'next/server'
import { refreshAgentDevice } from '@/services/agent-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params
  return toResponse(await refreshAgentDevice(id, key))
}

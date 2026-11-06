/** GET and POST /api/agents/[id]/devices: an agent's devices, and pairing one. See services/agent-devices-service.ts. */
import { NextRequest } from 'next/server'
import { addAgentDevice, listAgentDevices } from '@/services/agent-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(await listAgentDevices(id, { refresh: req.nextUrl.searchParams.get('refresh') === '1' }))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(await addAgentDevice(id, await req.json().catch(() => ({}))))
}

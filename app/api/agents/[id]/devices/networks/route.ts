/** GET, POST and DELETE /api/agents/[id]/devices/networks: the agent's Wi-Fi networks (F129). See services/agent-devices-service.ts. */
import { NextRequest } from 'next/server'
import { addAgentNetwork, listAgentNetworks, removeAgentNetwork } from '@/services/agent-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(await listAgentNetworks(id))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(await addAgentNetwork(id, await req.json().catch(() => ({}))))
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(await removeAgentNetwork(id, req.nextUrl.searchParams.get('ssid')))
}

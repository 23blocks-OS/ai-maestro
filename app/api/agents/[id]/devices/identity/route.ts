/** GET /api/agents/[id]/devices/identity: the agent's public key and address, for pairing. Creates the key. */
import { NextRequest } from 'next/server'
import { getAgentDeviceIdentity } from '@/services/agent-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(await getAgentDeviceIdentity(id))
}

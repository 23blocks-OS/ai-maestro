/** POST makes this the agent's active device; DELETE leaves it with no active device. */
import { NextRequest } from 'next/server'
import { jumpAgentDevice } from '@/services/agent-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params
  return toResponse(await jumpAgentDevice(id, key))
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id } = await params
  return toResponse(await jumpAgentDevice(id, null))
}

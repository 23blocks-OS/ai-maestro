/** DELETE /api/agents/[id]/devices/[key]: forget a device on this side. It does not unpair the device. */
import { NextRequest } from 'next/server'
import { forgetAgentDevice } from '@/services/agent-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params
  return toResponse(await forgetAgentDevice(id, key))
}

/** GET /api/devices: every agent's devices on this host. Local only: a host never calls a peer's. */
import { listHostDevices } from '@/services/agent-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  return toResponse(listHostDevices())
}

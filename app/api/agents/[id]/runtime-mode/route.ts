import { NextRequest } from 'next/server'
import { runtimeModeRequest } from '@/services/agents-wake-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * POST /api/agents/[id]/runtime-mode { mode: 'terminal' | 'streaming' }
 * Switch how the agent runs. The running mode is stopped before the other starts: never both at once.
 * Remote agents are switched on their own host (services/agents-wake-service.ts).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(await runtimeModeRequest(id, body))
}

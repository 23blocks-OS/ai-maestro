import { NextRequest } from 'next/server'
import { hibernateAgentRequest } from '@/services/agents-wake-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * POST /api/agents/[id]/hibernate
 * Hibernate an agent by stopping its session and updating status.
 * If the agent lives on a remote host, the request is proxied server-side
 * (logic in services/agents-wake-service.ts, shared with the headless router).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // No body or invalid JSON: the service uses its defaults
  const body = await request.json().catch(() => ({}))
  return toResponse(await hibernateAgentRequest(id, body))
}

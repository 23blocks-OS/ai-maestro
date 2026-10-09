import { NextRequest } from 'next/server'
import { wakeAgentRequest } from '@/services/agents-wake-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * POST /api/agents/[id]/wake
 * Wake a hibernated agent. If the agent lives on a remote host, the request is
 * proxied server-side to avoid browser CORS issues (body validation, program
 * lowercasing and proxying live in services/agents-wake-service.ts, shared with
 * the headless router).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // No body or invalid JSON: the service uses its defaults
  const body = await request.json().catch(() => ({}))
  return toResponse(await wakeAgentRequest(id, body))
}

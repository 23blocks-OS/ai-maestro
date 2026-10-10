/**
 * POST /api/agents/[id]/secret-requests/[rid] — the person answers a request:
 *   { value, name? }   store the secret in the local vault
 *   { decline: true }  say no
 *
 * The value goes to the vault and nowhere else: not logged, not echoed, not sent to the agent.
 * Logic in services/agent-secret-requests-service.ts (shared with the headless router).
 */
import { NextRequest } from 'next/server'
import { answerSecretRequest } from '@/services/agent-secret-requests-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params
  const body = await req.json().catch(() => ({}))
  return toResponse(await answerSecretRequest(id, rid, body))
}

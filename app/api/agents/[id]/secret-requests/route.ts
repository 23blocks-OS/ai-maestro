/**
 * GET  /api/agents/[id]/secret-requests — pending requests for a credential (names only)
 * POST /api/agents/[id]/secret-requests — an agent asks for one: { name, note? }
 *
 * Logic in services/agent-secret-requests-service.ts (shared with the headless router).
 * Live state: must stay dynamic.
 */
import { NextRequest } from 'next/server'
import { createSecretRequest, listSecretRequests } from '@/services/agent-secret-requests-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(await listSecretRequests(id))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  return toResponse(await createSecretRequest(id, body))
}

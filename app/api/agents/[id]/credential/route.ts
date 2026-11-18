import { NextRequest } from 'next/server'
import { getCredentialStatus } from '@/services/agents-core-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/** GET /api/agents/:id/credential: which account or key the agent is set to use, and what would defeat it (#65) */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(getCredentialStatus(id))
}

/**
 * GET  /api/agents/manager-links           — which of this host's agents would be linked to a person or agent (dry run)
 * POST /api/agents/manager-links { apply }  — apply it (apply: true); without it, the same dry run
 */

import { NextRequest } from 'next/server'
import { linkAgentManagers } from '@/services/agents-manager-links-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  return toResponse(await linkAgentManagers())
}

export async function POST(request: NextRequest) {
  const parsed = await request.json().catch(() => ({}))
  const body = parsed && typeof parsed === 'object' ? parsed : {}
  return toResponse(await linkAgentManagers({ apply: body.apply === true }))
}

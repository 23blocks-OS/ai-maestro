/**
 * Agent Resolve API
 *
 * GET /api/agents/resolve?q=Titania
 *   Resolves an id, name, alias or label to one agent. Returns
 *   { status: 'found' | 'ambiguous' | 'none', ... }; 'none' carries close matches.
 *
 * Thin wrapper — business logic in services/agents-directory-service.ts
 */

import { NextRequest } from 'next/server'
import { resolveAgentReference } from '@/services/agents-directory-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return toResponse(resolveAgentReference(request.nextUrl.searchParams.get('q') || ''))
}

/**
 * GET /api/agents/:id/commits — the commits and pull requests an agent made, by session.
 *   ?session=<id>  one session only
 *   ?limit=<n>     newest n commits (default 200, at most 1000)
 * An agent that lives on another host is asked of that host.
 *
 * Thin wrapper — business logic in services/commit-trace-service.ts
 */

import { NextRequest } from 'next/server'
import { getAgentCommits } from '@/services/commit-trace-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const limit = url.searchParams.get('limit')
  return toResponse(await getAgentCommits(id, {
    session: url.searchParams.get('session') || undefined,
    limit: limit ? Number(limit) : undefined,
  }))
}

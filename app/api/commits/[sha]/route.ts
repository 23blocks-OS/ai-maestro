/**
 * GET /api/commits/:sha — which agent and session made this commit, from every host.
 *   ?local=1   this host only (what a peer is asked, so hosts never forward in a loop)
 *   ?pr=528    the pull request number, when the commit's own message does not say it
 *   ?repo=o/r  narrow the pull request to one repository
 *
 * Thin wrapper — business logic in services/commit-trace-service.ts
 */

import { NextRequest } from 'next/server'
import { traceCommit } from '@/services/commit-trace-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET(request: NextRequest, { params }: { params: Promise<{ sha: string }> }) {
  const { sha } = await params
  const url = new URL(request.url)
  const pr = url.searchParams.get('pr')
  return toResponse(await traceCommit(sha, {
    local: url.searchParams.get('local') === '1',
    pr: pr ? Number(pr) : undefined,
    repo: url.searchParams.get('repo') || undefined,
  }))
}

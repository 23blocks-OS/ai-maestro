/**
 * GET /api/agents/[id]/sql-write-requests — the agent's pending SQL write requests (F037),
 * read from the agentic-sql write wrapper's request files.
 *
 * Logic in services/agent-sql-write-requests-service.ts (shared with the headless router).
 * Live state: must stay dynamic.
 */
import { listSqlWriteRequests } from '@/services/agent-sql-write-requests-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(await listSqlWriteRequests(id))
}

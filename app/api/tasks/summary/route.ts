/**
 * GET /api/tasks/summary — open, waiting and waiting-on-juan card counts per agent on this host
 */

import { getTaskSummary } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

// Without this, a production build prerenders the answer once and serves it forever
export const dynamic = 'force-dynamic'

export async function GET() {
  return toResponse(getTaskSummary())
}

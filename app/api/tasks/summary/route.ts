/**
 * GET /api/tasks/summary — open, waiting and waiting-on-juan card counts per agent on this host
 */

import { getTaskSummary } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET() {
  return toResponse(getTaskSummary())
}

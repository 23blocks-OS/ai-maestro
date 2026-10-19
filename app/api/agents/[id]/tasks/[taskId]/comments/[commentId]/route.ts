/**
 * POST /api/agents/:id/tasks/:taskId/comments/:commentId — send an operator comment to the agent again (Retry)
 */

import { NextRequest } from 'next/server'
import { retryAgentTaskComment } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string; commentId: string }> }) {
  const { id, taskId, commentId } = await params
  return toResponse(await retryAgentTaskComment(id, taskId, commentId))
}

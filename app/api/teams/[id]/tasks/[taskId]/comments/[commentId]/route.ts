/**
 * POST /api/teams/:id/tasks/:taskId/comments/:commentId — send an operator comment to the assignee again
 */

import { NextRequest } from 'next/server'
import { retryTeamTaskComment } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string; commentId: string }> }) {
  const { id, taskId, commentId } = await params
  return toResponse(await retryTeamTaskComment(id, taskId, commentId))
}

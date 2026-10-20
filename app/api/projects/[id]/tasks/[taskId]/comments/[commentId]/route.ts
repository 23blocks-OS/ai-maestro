/**
 * POST /api/projects/:id/tasks/:taskId/comments/:commentId — send an operator comment to the assignee again (Retry)
 */

import { NextRequest } from 'next/server'
import { retryProjectTaskComment } from '@/services/projects-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string; commentId: string }> }) {
  const { id, taskId, commentId } = await params
  return toResponse(await retryProjectTaskComment(id, taskId, commentId))
}

/**
 * POST /api/projects/:id/tasks/:taskId/comments — comment on a project card.
 * An operator comment is also handed to the card's assignee, on whichever host that agent lives.
 */

import { NextRequest } from 'next/server'
import { addProjectTaskComment } from '@/services/projects-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(await addProjectTaskComment(id, taskId, body))
}

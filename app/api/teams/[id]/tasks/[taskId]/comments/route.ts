/**
 * POST /api/teams/:id/tasks/:taskId/comments — comment on a team card (operator comments go to the assignee)
 */

import { NextRequest } from 'next/server'
import { addTeamTaskComment } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(await addTeamTaskComment(id, taskId, body))
}

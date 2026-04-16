import { NextRequest } from 'next/server'
import { listTeamTasks, createTeamTask } from '@/services/teams-service'
import { toResponse } from '@/app/api/_helpers'

// GET /api/teams/[id]/tasks - List tasks with resolved dependencies
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = listTeamTasks(id)
  return toResponse(result)
}

// POST /api/teams/[id]/tasks - Create a new task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const result = createTeamTask(id, body)
  return toResponse(result)
}

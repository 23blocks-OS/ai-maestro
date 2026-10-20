/**
 * GET  /api/projects/:id/tasks — the project's cards (?assignee=<agentId>, ?status)
 * POST /api/projects/:id/tasks — add a card; it can be assigned to any agent, on any host
 */

import { NextRequest } from 'next/server'
import { listProjectTasks, createProjectTask } from '@/services/projects-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  return toResponse(listProjectTasks(id, {
    assignee: url.searchParams.get('assignee') || undefined,
    status: url.searchParams.get('status') || undefined,
  }))
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(createProjectTask(id, body))
}

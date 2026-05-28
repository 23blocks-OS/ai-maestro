import { getAgentSchedules, createAgentSchedule } from '@/services/agents-schedule-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return toResponse(getAgentSchedules(id))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  return toResponse(createAgentSchedule(id, body))
}

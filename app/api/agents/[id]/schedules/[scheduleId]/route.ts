import { getScheduleById, updateAgentSchedule, deleteAgentSchedule, getScheduleExecutions } from '@/services/agents-schedule-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const { scheduleId } = await params
  const url = new URL(request.url)

  if (url.searchParams.get('executions') === 'true') {
    const limit = parseInt(url.searchParams.get('limit') || '20', 10)
    return toResponse(getScheduleExecutions(scheduleId, limit))
  }

  return toResponse(getScheduleById(scheduleId))
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const { scheduleId } = await params
  const body = await request.json()
  return toResponse(updateAgentSchedule(scheduleId, body))
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const { scheduleId } = await params
  return toResponse(deleteAgentSchedule(scheduleId))
}

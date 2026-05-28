import { triggerSchedule } from '@/services/agents-schedule-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const { scheduleId } = await params
  let triggeredBy: 'manual' | 'webhook' = 'manual'

  try {
    const body = await request.json()
    if (body.triggeredBy === 'webhook') triggeredBy = 'webhook'
  } catch {
    // No body or invalid JSON — default to manual
  }

  const result = await triggerSchedule(scheduleId, triggeredBy)
  return toResponse(result)
}

import { getAllSchedules, getAllExecutions } from '@/services/agents-schedule-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)

  if (url.searchParams.get('executions') === 'true') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    return toResponse(getAllExecutions(limit))
  }

  return toResponse(getAllSchedules())
}

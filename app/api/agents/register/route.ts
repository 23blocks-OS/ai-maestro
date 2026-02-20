import { NextResponse } from 'next/server'
import { registerAgent } from '@/services/agents-core-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/register
 * Register an agent from session name or cloud config.
 */
export async function POST(request: Request) {
  const body = await request.json()
  const result = registerAgent(body)

  if (result.error) {
    return NextResponse.json(
      { error: result.error, details: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}

import { NextResponse } from 'next/server'
import { getDockerStats } from '@/services/agents-docker-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await getDockerStats()
  return NextResponse.json(result.data, { status: result.status })
}

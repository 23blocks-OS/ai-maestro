import { NextRequest } from 'next/server'
import { getDatabaseInfo, initializeDatabase } from '@/services/agents-graph-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/agents/:id/database
 * Get agent database information and metadata
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const result = await getDatabaseInfo(agentId)
  return toResponse(result)
}

/**
 * POST /api/agents/:id/database
 * Initialize or reset agent database
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const result = await initializeDatabase(agentId)
  return toResponse(result)
}

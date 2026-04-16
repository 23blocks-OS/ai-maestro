/**
 * Help Agent API
 *
 * POST /api/help/agent - Create or return existing AI Maestro assistant agent
 * DELETE /api/help/agent - Kill the assistant agent and clean up
 * GET /api/help/agent - Check assistant agent status
 */

import {
  createAssistantAgent,
  deleteAssistantAgent,
  getAssistantStatus,
} from '@/services/help-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * POST - Create or return existing assistant agent
 */
export async function POST() {
  const result = await createAssistantAgent()
  return toResponse(result)
}

/**
 * DELETE - Kill assistant agent and clean up
 */
export async function DELETE() {
  const result = await deleteAssistantAgent()
  return toResponse(result)
}

/**
 * GET - Check assistant agent status
 */
export async function GET() {
  const result = await getAssistantStatus()
  return toResponse(result)
}

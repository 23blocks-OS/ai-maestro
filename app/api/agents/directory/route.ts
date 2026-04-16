/**
 * Agent Directory API
 *
 * GET /api/agents/directory
 *   Returns the agent directory for this host
 *   Used by peer hosts to sync agent locations
 *
 * Thin wrapper — business logic in services/agents-directory-service.ts
 */

import { NextRequest } from 'next/server'
import { getDirectory } from '@/services/agents-directory-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET(_request: NextRequest) {
  const result = getDirectory()
  return toResponse(result)
}

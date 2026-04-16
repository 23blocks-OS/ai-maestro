/**
 * Agent Directory Sync API
 *
 * POST /api/agents/directory/sync
 *   Triggers a directory sync with peer hosts
 *
 * Thin wrapper — business logic in services/agents-directory-service.ts
 */

import { NextRequest } from 'next/server'
import { syncDirectory } from '@/services/agents-directory-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(_request: NextRequest) {
  const result = await syncDirectory()
  return toResponse(result)
}

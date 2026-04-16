/**
 * Agent Host ID Normalization API
 *
 * GET /api/agents/normalize-hosts
 *   Returns diagnostic information about host ID inconsistencies
 *
 * POST /api/agents/normalize-hosts
 *   Normalizes all agent hostIds to canonical format
 *
 * Thin wrapper — business logic in services/agents-directory-service.ts
 */

import { diagnoseHosts, normalizeHosts } from '@/services/agents-directory-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET() {
  const result = diagnoseHosts()
  return toResponse(result)
}

export async function POST() {
  const result = normalizeHosts()
  return toResponse(result)
}

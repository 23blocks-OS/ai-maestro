/**
 * GET /api/policy — this host's rules for who may reach whom (F042), read-only
 */
import { getPolicy } from '@/services/policy-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  return toResponse(getPolicy())
}

import { listAllDomains, createNewDomain } from '@/services/domains-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/domains
 * List all email domains
 */
export async function GET() {
  const result = listAllDomains()
  return toResponse(result)
}

/**
 * POST /api/domains
 * Create a new email domain
 */
export async function POST(request: Request) {
  const body = await request.json()
  const result = createNewDomain(body)
  return toResponse(result)
}

import { NextRequest } from 'next/server'
import { checkRemoteHealth } from '@/services/hosts-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/hosts/health?url=<hostUrl>
 *
 * Proxy health check request to remote host.
 */
export async function GET(request: NextRequest) {
  const hostUrl = request.nextUrl.searchParams.get('url') || ''

  const result = await checkRemoteHealth(hostUrl)
  return toResponse(result)
}

import { proxyHealthCheck } from '@/services/agents-core-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/health
 * Proxy health check to a remote agent (avoids CORS).
 */
export async function POST(request: Request) {
  const { url } = await request.json()
  const result = await proxyHealthCheck(url)
  return toResponse(result)
}

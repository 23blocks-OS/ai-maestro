import { getPtyDebugInfo } from '@/services/config-service'
import { toResponse } from '@/app/api/_helpers'

// Disable Next.js caching for this endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/debug/pty
 * Returns PTY usage statistics for monitoring and debugging PTY leaks.
 */
export async function GET() {
  const result = await getPtyDebugInfo()
  return toResponse(result)
}

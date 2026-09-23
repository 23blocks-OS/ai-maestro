/**
 * POST /api/memory/backlog — start the night backlog worker (history not yet
 * consolidated), if it is night and it is not running. Returns at once; the
 * work runs in the background. See lib/memory/backlog.ts.
 */

import { startMemoryBacklog } from '@/services/agents-memory-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST() {
  return toResponse(await startMemoryBacklog())
}

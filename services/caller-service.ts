/**
 * GET /api/caller: who the server thinks is calling (lib/caller-identity.ts).
 * A client can check what it will be treated as before it sends, and an operator can see the mode.
 */
import { describeCaller, type Caller } from '@/lib/caller-identity'
import type { ServiceResult } from '@/services/service-errors'

export function getCaller(caller: Caller): ServiceResult<ReturnType<typeof describeCaller>> {
  return { data: describeCaller(caller), status: 200 }
}

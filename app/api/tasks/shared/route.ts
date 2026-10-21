/**
 * GET /api/tasks/shared?agent=<id>[&as=<name>,<alias>] — the open cards on THIS host, in any scope
 * (an agent's board, a team's, a project's), that list the agent as a co-owner and are not its own.
 * Each host answers for the cards it holds; an agent's board on another host asks every host this
 * way. `as` adds names the agent is also known by (the asking host knows them, this one may not).
 *
 * Thin wrapper — business logic in services/agent-tasks-service.ts
 */

import { NextRequest } from 'next/server'
import { getSharedTasks } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

// Reads files that change: never prerendered
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const names = (url.searchParams.get('as') || '').split(',').map(n => n.trim()).filter(Boolean)
  return toResponse(getSharedTasks(url.searchParams.get('agent') || '', names))
}

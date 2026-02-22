import { NextRequest, NextResponse } from 'next/server'
import { checkMessageAllowed } from '@/lib/message-filter'
import { loadAgents } from '@/lib/agent-registry'
import { isValidUuid } from '@/lib/validation'

// In-memory cache: avoids re-reading governance + teams files for every agent
// on each request. TTL of 5 seconds balances freshness with performance.
// Note: Cache does not auto-invalidate when governance/team config changes.
// TTL-based expiry handles staleness. Phase 2: add event-driven invalidation.
export const dynamic = 'force-dynamic'

const cache = new Map<string, { ids: string[]; expiresAt: number }>()
const CACHE_TTL_MS = 5_000

export async function GET(request: NextRequest) {
  try {
    const agentId = request.nextUrl.searchParams.get('agentId')

    if (!agentId) {
      return NextResponse.json({ error: 'agentId query parameter is required' }, { status: 400 })
    }

    // MF-010: Use strict UUID validation instead of relaxed regex to prevent cache pollution
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agentId format' }, { status: 400 })
    }

    // Check cache first
    const cached = cache.get(agentId)
    if (cached && Date.now() < cached.expiresAt) {
      return NextResponse.json({ reachableAgentIds: cached.ids })
    }

    // Cache miss or expired — compute reachable agents
    const allAgents = loadAgents()
    const reachableAgentIds: string[] = []

    for (const agent of allAgents) {
      if (agent.id === agentId) continue
      if (agent.deletedAt) continue

      const result = checkMessageAllowed({
        senderAgentId: agentId,
        recipientAgentId: agent.id,
      })

      if (result.allowed) {
        reachableAgentIds.push(agent.id)
      }
    }

    // Store in cache with TTL
    cache.set(agentId, { ids: reachableAgentIds, expiresAt: Date.now() + CACHE_TTL_MS })

    // Evict stale/expired entries on every cache write to prevent unbounded growth.
    // CC-P1-110: Also enforce a max-size bound in case many distinct agentIds are queried within the TTL window.
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (now >= entry.expiresAt) cache.delete(key)
    }
    if (cache.size > 1000) {
      cache.clear()
    }

    return NextResponse.json({ reachableAgentIds })
  } catch (error) {
    console.error('Error computing reachable agents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

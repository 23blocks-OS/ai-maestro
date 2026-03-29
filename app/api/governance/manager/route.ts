import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import { verifyPassword, setManager, removeManager, loadGovernance } from '@/lib/governance'
import { getAgent } from '@/lib/agent-registry'
// SF-029 (P8): Use atomic checkAndRecordAttempt to match cross-host-governance-service pattern
import { checkAndRecordAttempt, resetRateLimit } from '@/lib/rate-limit'

// NT-023 (P8): Ensure Next.js does not cache this route
export const dynamic = 'force-dynamic'

const GOVERNANCE_JSON_PATH = path.join(os.homedir(), '.aimaestro', 'governance.json')

export async function POST(request: NextRequest) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { agentId, password } = body

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Governance password is required' }, { status: 400 })
    }

    const config = loadGovernance()
    if (!config.passwordHash) {
      return NextResponse.json({ error: 'Governance password not set. Set a password first via POST /api/governance/password' }, { status: 400 })
    }

    // SF-029 (P8): Atomic check-and-record to eliminate TOCTOU window (matches cross-host-governance-service)
    const rateCheck = checkAndRecordAttempt('governance-manager-auth')
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many failed password attempts. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s` },
        { status: 429 }
      )
    }

    if (!(await verifyPassword(password))) {
      return NextResponse.json({ error: 'Invalid governance password' }, { status: 401 })
    }
    // Password verified successfully -- reset rate limit counter
    resetRateLimit('governance-manager-auth')

    // agentId === null removes the manager role; undefined/missing is invalid
    if (agentId === null) {
      const { beginTransaction, commitTransaction, discardTransaction } = await import('@/lib/config-transaction')
      const txId = await beginTransaction({
        description: 'Remove manager role',
        operation: 'governance:update',
        scope: 'global',
        configFiles: { governance_json: GOVERNANCE_JSON_PATH },
      })
      try {
        await removeManager()
        commitTransaction(txId)
        return NextResponse.json({ success: true, managerId: null })
      } catch (err) {
        discardTransaction(txId)
        throw err
      }
    }

    if (typeof agentId !== 'string' || !agentId.trim()) {
      return NextResponse.json({ error: 'agentId must be a non-empty string or null' }, { status: 400 })
    }

    // Verify agent exists
    const agent = getAgent(agentId)
    if (!agent) {
      // NT-014: Do not quote agentId in error message (already validated as non-empty string above)
      return NextResponse.json({ error: `Agent ${agentId} not found` }, { status: 404 })
    }

    const { beginTransaction, commitTransaction, discardTransaction } = await import('@/lib/config-transaction')
    const txId = await beginTransaction({
      description: `Assign manager ${agentId}`,
      operation: 'governance:update',
      scope: 'global',
      configFiles: { governance_json: GOVERNANCE_JSON_PATH },
    })
    try {
      await setManager(agentId)

      // Auto-assign required role-plugin for MANAGER title
      try {
        const { autoAssignRolePluginForTitle } = await import('@/services/role-plugin-service')
        await autoAssignRolePluginForTitle('manager', agentId)
      } catch (err) {
        console.warn('[governance] Failed to auto-assign role-plugin for MANAGER:', err instanceof Error ? err.message : err)
        // Non-blocking — title assignment succeeds even if plugin assignment fails
      }

      commitTransaction(txId)
      // NT-028: Use nullish coalescing to preserve empty-string agent names
      return NextResponse.json({ success: true, managerId: agentId, managerName: agent.name ?? agent.alias })
    } catch (err) {
      discardTransaction(txId)
      throw err
    }
  } catch (error) {
    console.error('[governance] manager POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set manager' },
      { status: 500 }
    )
  }
}

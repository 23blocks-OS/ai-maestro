/**
 * POST /api/governance/password - Set or change governance password
 *
 * SF-031 (P8): Delegates all business logic to governance-service.setGovernancePassword
 * to eliminate duplicate password logic between route and service layers.
 */

import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import { setGovernancePassword } from '@/services/governance-service'

const GOVERNANCE_JSON_PATH = path.join(os.homedir(), '.aimaestro', 'governance.json')

// NT-023 (P8): Ensure Next.js does not cache this route
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // SF-031 (P8): Single source of truth for password logic lives in governance-service
    const { beginTransaction, commitTransaction, discardTransaction } = await import('@/lib/config-transaction')
    const txId = await beginTransaction({
      description: 'Set governance password',
      operation: 'governance:update',
      scope: 'global',
      configFiles: { governance_json: GOVERNANCE_JSON_PATH },
    })
    try {
      const result = await setGovernancePassword({
        password: body.password,
        currentPassword: body.currentPassword,
        userName: body.userName,
      })

      if (result.error) {
        discardTransaction(txId)
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      commitTransaction(txId)
      return NextResponse.json(result.data, { status: result.status })
    } catch (innerError) {
      discardTransaction(txId)
      throw innerError
    }
  } catch (error) {
    console.error('[governance] password POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

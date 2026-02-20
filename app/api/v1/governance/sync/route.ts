/**
 * Governance Sync Endpoint (Layer 1: Cross-Host State Replication)
 *
 * POST /api/v1/governance/sync  — Receive governance state from a peer host
 * GET  /api/v1/governance/sync  — Return this host's governance snapshot
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleGovernanceSyncMessage, buildLocalGovernanceSnapshot } from '@/lib/governance-sync'
import { getHosts } from '@/lib/hosts-config'
import type { GovernanceSyncMessage } from '@/types/governance'

/** POST: Receive governance sync from a peer host */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json() as GovernanceSyncMessage

  // Validate required fields
  if (!body || !body.fromHostId || !body.type) {
    return NextResponse.json(
      { error: 'Missing required fields: fromHostId, type' },
      { status: 400 }
    )
  }

  // Verify sender is a known peer host
  const hosts = getHosts()
  const knownHost = hosts.find(h => h.id === body.fromHostId)
  if (!knownHost) {
    return NextResponse.json(
      { error: `Unknown host: ${body.fromHostId}` },
      { status: 403 }
    )
  }

  handleGovernanceSyncMessage(body.fromHostId, body)
  return NextResponse.json({ ok: true })
}

/** GET: Return this host's full governance snapshot for peer sync requests */
export async function GET(): Promise<NextResponse> {
  const snapshot = buildLocalGovernanceSnapshot()
  return NextResponse.json({
    ...snapshot,
    lastSyncAt: new Date().toISOString(),
    ttl: 300,
  })
}

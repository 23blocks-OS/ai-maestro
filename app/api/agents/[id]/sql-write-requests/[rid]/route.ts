/**
 * POST /api/agents/[id]/sql-write-requests/[rid] — the person answers a write request (F037):
 *   { action: 'approve', environment }  approve it; environment is the name typed in the card
 *   { action: 'reject' }                reject it
 *
 * Accepted only from a browser page of this server (same-origin); see the service for what that does
 * and does not protect against. Logic in services/agent-sql-write-requests-service.ts.
 */
import { NextRequest } from 'next/server'
import { answerSqlWriteRequest } from '@/services/agent-sql-write-requests-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params
  const body = await req.json().catch(() => ({}))
  return toResponse(await answerSqlWriteRequest(id, rid, body, {
    secFetchSite: req.headers.get('sec-fetch-site'),
    origin: req.headers.get('origin'),
    host: req.headers.get('host'),
  }))
}

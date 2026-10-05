import { NextRequest, NextResponse } from 'next/server'
import { ingestStatusSnapshot, MAX_REPORT_CHARS } from '@/services/status-snapshots-service'
import { toResponse } from '@/app/api/_helpers'

// A report is live state: never cached
export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/[id]/status-snapshot
 * The status line reports Claude Code's live values for the session (model,
 * context, this session's cost, effort, prompt-cache state) so the chat header
 * can show what the terminal bar shows. Kept in memory only. Body: see
 * services/status-snapshots-service.ts (ingestStatusSnapshot).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  let text = ''
  try { text = await request.text() } catch { text = '' }
  if (text.length > MAX_REPORT_CHARS) {
    return NextResponse.json({ error: 'payload_too_large', message: `body exceeds ${MAX_REPORT_CHARS} characters` }, { status: 413 })
  }
  let body: unknown
  try { body = JSON.parse(text) } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'body must be JSON' }, { status: 400 })
  }
  return toResponse(ingestStatusSnapshot(agentId, body))
}

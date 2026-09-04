/**
 * POST /api/agents/{id}/files — hand files to an agent (#270).
 *
 * Accepts multipart/form-data so a browser can post a pasted screenshot or a
 * dropped PDF directly. The bytes must land on the machine the agent runs on,
 * so a request for a remote agent is proxied there — the same pattern the wake
 * route uses, and for the same reason: the file is useless on the wrong host.
 */
import { NextRequest, NextResponse } from 'next/server'
import { uploadFilesToAgent, type IncomingFile } from '@/services/agents-upload-service'
import { getAgent } from '@/lib/agent-registry'
import { isSelf } from '@/lib/hosts-config'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const form = await request.formData()
    const entries = form.getAll('files').filter((f): f is File => f instanceof File)
    if (entries.length === 0) {
      return NextResponse.json({ error: 'invalid_request', message: 'No files provided' }, { status: 400 })
    }

    // Remote agent: the bytes belong on its host, not this one.
    const agent = getAgent(id)
    const isLocal = !agent?.hostId || isSelf(agent.hostId) || (agent?.hostUrl ? isSelf(agent.hostUrl) : false)
    if (!isLocal && agent?.hostUrl) {
      const proxied = new FormData()
      for (const f of entries) proxied.append('files', f, f.name)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 60_000)
      try {
        const res = await fetch(`${agent.hostUrl}/api/agents/${id}/files`, {
          method: 'POST', body: proxied, signal: controller.signal,
        })
        return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
      } finally {
        clearTimeout(timer)
      }
    }

    const files: IncomingFile[] = []
    for (const f of entries) {
      files.push({
        filename: f.name || null,
        contentType: f.type || null,
        bytes: Buffer.from(await f.arrayBuffer()),
      })
    }

    return toResponse(await uploadFilesToAgent(id, files))
  } catch (error) {
    console.error('[Agent Files] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

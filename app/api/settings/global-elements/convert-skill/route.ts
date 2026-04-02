/**
 * POST /api/settings/global-elements/convert-skill
 *
 * Convert elements between AI coding clients.
 * Accepts source path/URL, target client, optional element filter.
 *
 * Body: { source: string, targetClient: string, elements?: string[], dryRun?: boolean }
 *
 * GET /api/settings/global-elements/convert-skill?sourceClient=claude-code&targetClient=codex
 *
 * Returns conversion capabilities (supported elements + warnings).
 */

import { NextRequest, NextResponse } from 'next/server'
import { convertElements, getConversionCapabilities } from '@/services/cross-client-conversion-service'
import { PROVIDER_IDS } from '@/lib/converter/registry'
import type { ProviderId, ElementType } from '@/lib/converter/types'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { source, targetClient, elements, dryRun, scope, projectDir, force } = body

  if (!source || typeof source !== 'string') {
    return NextResponse.json({ error: 'source is required (path, URL, or scope path)' }, { status: 400 })
  }
  if (!targetClient || !PROVIDER_IDS.includes(targetClient as ProviderId)) {
    return NextResponse.json({ error: `targetClient must be one of: ${PROVIDER_IDS.join(', ')}` }, { status: 400 })
  }

  try {
    const result = await convertElements({
      source,
      targetClient: targetClient as ProviderId,
      elements: elements as ElementType[] | undefined,
      scope: scope === 'project' ? 'project' : 'user',
      projectDir: typeof projectDir === 'string' ? projectDir : undefined,
      dryRun: Boolean(dryRun),
      force: Boolean(force),
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Conversion failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sourceClient = searchParams.get('sourceClient')
  const targetClient = searchParams.get('targetClient')

  if (!sourceClient || !targetClient) {
    return NextResponse.json({ error: 'sourceClient and targetClient required' }, { status: 400 })
  }
  if (!PROVIDER_IDS.includes(sourceClient as ProviderId) || !PROVIDER_IDS.includes(targetClient as ProviderId)) {
    return NextResponse.json({ error: `Clients must be one of: ${PROVIDER_IDS.join(', ')}` }, { status: 400 })
  }

  const caps = await getConversionCapabilities(sourceClient as ProviderId, targetClient as ProviderId)
  return NextResponse.json({ sourceClient, targetClient, ...caps })
}

/**
 * GET /api/settings/global-elements/client-skills?client=codex
 *
 * List all elements installed for a specific AI client (user scope).
 * Returns skills, agents, and instructions for the given client type.
 */

import { NextRequest, NextResponse } from 'next/server'
import { listClientElements } from '@/services/cross-client-conversion-service'
import { PROVIDER_IDS } from '@/lib/converter/registry'
import type { ProviderId } from '@/lib/converter/types'

export const dynamic = 'force-dynamic'

// Map short names to provider IDs for backward compat
const SHORT_TO_PROVIDER: Record<string, ProviderId> = {
  claude: 'claude-code',
  codex: 'codex',
  gemini: 'gemini',
  opencode: 'opencode',
  kiro: 'kiro',
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const client = searchParams.get('client')

  if (!client) {
    return NextResponse.json({ error: 'client param required' }, { status: 400 })
  }

  const providerId = SHORT_TO_PROVIDER[client] || client as ProviderId
  if (!PROVIDER_IDS.includes(providerId)) {
    return NextResponse.json({ error: `Unknown client: ${client}. Available: ${PROVIDER_IDS.join(', ')}` }, { status: 400 })
  }

  const elements = await listClientElements(providerId, 'user')
  return NextResponse.json({ client: providerId, ...elements })
}

/**
 * Create Persona — Unified Agent Creation API
 *
 * POST /api/agents/create-persona
 *
 * Single endpoint for both the wizard (predefined role plugins) and
 * Haephestos (custom TOML-generated plugins). Creates the persona folder
 * at ~/agents/<personaName>/ and installs the role plugin with --scope local.
 *
 * Accepts either:
 *   - tomlContent (Haephestos): generates plugin, adds to local marketplace, installs
 *   - pluginName (Wizard): installs an existing predefined role plugin
 */

import { NextRequest, NextResponse } from 'next/server'
import { createPersona } from '@/services/role-plugin-service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    let body: {
      personaName?: string
      tomlContent?: string
      pluginName?: string
      marketplaceName?: string
      agentDescription?: string
    }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.personaName || typeof body.personaName !== 'string') {
      return NextResponse.json(
        { error: 'personaName is required and must be a string' },
        { status: 400 },
      )
    }

    // MF-024: Validate personaName format — same regex as create-from-toml/route.ts
    const PERSONA_NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
    if (!PERSONA_NAME_RE.test(body.personaName)) {
      return NextResponse.json(
        { error: 'personaName must match ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ (lowercase alphanumeric and hyphens, no leading/trailing hyphens)' },
        { status: 400 },
      )
    }

    if (body.tomlContent !== undefined && typeof body.tomlContent !== 'string') {
      return NextResponse.json(
        { error: 'tomlContent must be a string if provided' },
        { status: 400 },
      )
    }

    if (body.pluginName !== undefined && typeof body.pluginName !== 'string') {
      return NextResponse.json(
        { error: 'pluginName must be a string if provided' },
        { status: 400 },
      )
    }

    if (!body.tomlContent && !body.pluginName) {
      return NextResponse.json(
        { error: 'Either tomlContent (Haephestos) or pluginName (wizard) is required' },
        { status: 400 },
      )
    }

    if (body.tomlContent && body.pluginName) {
      return NextResponse.json(
        { error: 'Provide either tomlContent or pluginName, not both' },
        { status: 400 },
      )
    }

    if (body.marketplaceName !== undefined && typeof body.marketplaceName !== 'string') {
      return NextResponse.json(
        { error: 'marketplaceName must be a string if provided' },
        { status: 400 },
      )
    }

    if (body.agentDescription !== undefined && typeof body.agentDescription !== 'string') {
      return NextResponse.json(
        { error: 'agentDescription must be a string if provided' },
        { status: 400 },
      )
    }

    // Build args conditionally: tomlContent and agentDescription are only relevant
    // to the Haephestos flow; pluginName and marketplaceName only to the wizard flow.
    // Keeping them separate prevents silent no-ops and makes the contract explicit.
    const personaArgs = body.tomlContent
      ? {
          personaName: body.personaName,
          tomlContent: body.tomlContent,
          agentDescription: body.agentDescription,
        }
      : {
          personaName: body.personaName,
          pluginName: body.pluginName,
          marketplaceName: body.marketplaceName,
        }

    const result = await createPersona(personaArgs)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('[create-persona] Failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to create persona'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

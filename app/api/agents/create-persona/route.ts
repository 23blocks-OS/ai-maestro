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

    const result = await createPersona({
      personaName: body.personaName,
      tomlContent: body.tomlContent,
      pluginName: body.pluginName,
      marketplaceName: body.marketplaceName,
      agentDescription: body.agentDescription,
    })

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

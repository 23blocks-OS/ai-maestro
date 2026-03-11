import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agents/creation-helper/toml-preview?path=<encoded-path>
 * Returns the raw content of a .agent.toml file for preview.
 */
export async function GET(req: NextRequest) {
  let tomlPath = req.nextUrl.searchParams.get('path')
  if (!tomlPath) {
    return NextResponse.json({ exists: false, content: '' })
  }

  // Resolve ~ to HOME directory
  if (tomlPath.startsWith('~/') && process.env.HOME) {
    tomlPath = tomlPath.replace('~', process.env.HOME)
  }

  // Only allow reading from the expected temp directory
  const allowedPrefix = process.env.HOME
    ? `${process.env.HOME}/.aimaestro/tmp/`
    : '/tmp/'
  if (!tomlPath.startsWith(allowedPrefix) && !tomlPath.startsWith('/tmp/')) {
    return NextResponse.json(
      { error: 'Path not allowed' },
      { status: 403 }
    )
  }

  if (!existsSync(tomlPath)) {
    return NextResponse.json({ exists: false, content: '' })
  }

  try {
    const content = await readFile(tomlPath, 'utf-8')
    return NextResponse.json({ exists: true, content })
  } catch {
    return NextResponse.json({ exists: false, content: '' })
  }
}

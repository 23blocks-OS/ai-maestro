import { NextRequest, NextResponse } from 'next/server'
import { readFile, readdir } from 'fs/promises'
import { existsSync, statSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agents/creation-helper/toml-preview?path=<encoded-path>
 * Returns the raw content of a .agent.toml file for preview.
 * If `path` is a directory, finds the first *.agent.toml file inside it.
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

  // Only allow reading from the Haephestos working directory
  const allowedPrefix = process.env.HOME
    ? `${process.env.HOME}/agents/haephestos/`
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
    // If path is a directory, find the first *.agent.toml file
    if (statSync(tomlPath).isDirectory()) {
      const files = await readdir(tomlPath)
      const tomlFile = files.find(f => f.endsWith('.agent.toml'))
      if (!tomlFile) {
        return NextResponse.json({ exists: false, content: '' })
      }
      tomlPath = join(tomlPath, tomlFile)
    }

    const content = await readFile(tomlPath, 'utf-8')
    return NextResponse.json({ exists: true, content })
  } catch {
    return NextResponse.json({ exists: false, content: '' })
  }
}

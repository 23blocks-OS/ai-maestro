/**
 * Element Content API
 *
 * GET /api/settings/element-content?path=<filepath>
 *
 * Returns the text content of a plugin element file (skill, agent, command, rule, hook config, mcp config).
 * Path must be under ~/.claude/plugins/ for security — rejects paths outside that scope.
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import os from 'os'

export const dynamic = 'force-dynamic'

const PLUGINS_BASE = `${os.homedir()}/.claude/plugins`

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path')
  if (!filePath) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 })
  }

  // Security: only allow reading files under ~/.claude/plugins/
  const resolved = filePath.replace(/\.\./g, '') // strip path traversal
  if (!resolved.startsWith(PLUGINS_BASE)) {
    return NextResponse.json({ error: 'Access denied — path must be under ~/.claude/plugins/' }, { status: 403 })
  }

  if (!existsSync(resolved)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  try {
    const content = await readFile(resolved, 'utf-8')
    // Limit to 50KB to avoid sending huge files to the browser
    const truncated = content.length > 50000
    return NextResponse.json({
      content: truncated ? content.slice(0, 50000) : content,
      truncated,
      size: content.length,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 })
  }
}

/**
 * Element Content API
 *
 * GET /api/settings/element-content?path=<filepath>
 *   Returns the text content of a plugin element file.
 *
 * GET /api/settings/element-content?path=<.mcp.json>&server=<name>&action=mcp-tools
 *   Discovers MCP server tools by running the mcp_discovery.py script.
 *
 * Path must be under ~/.claude/plugins/ for security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

const PLUGINS_BASE = `${os.homedir()}/.claude/plugins`
const PROJECT_ROOT = process.cwd()

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path')
  const action = req.nextUrl.searchParams.get('action')
  const serverName = req.nextUrl.searchParams.get('server')

  if (!filePath) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 })
  }

  // Security: only allow reading files under ~/.claude/plugins/
  const resolved = filePath.replace(/\.\./g, '')
  if (!resolved.startsWith(PLUGINS_BASE)) {
    return NextResponse.json({ error: 'Access denied — path must be under ~/.claude/plugins/' }, { status: 403 })
  }

  if (!existsSync(resolved)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // MCP tools discovery mode
  if (action === 'mcp-tools') {
    if (!serverName) {
      return NextResponse.json({ error: 'server parameter required for mcp-tools action' }, { status: 400 })
    }
    // Sanitize server name
    const safeName = serverName.replace(/[^a-zA-Z0-9._@:+-]/g, '')
    if (!safeName) {
      return NextResponse.json({ error: 'Invalid server name' }, { status: 400 })
    }
    const scriptPath = join(PROJECT_ROOT, 'scripts_dev', 'mcp_discovery.py')
    if (!existsSync(scriptPath)) {
      return NextResponse.json({ error: 'MCP discovery script not found' }, { status: 500 })
    }
    try {
      const { execSync } = await import('child_process')
      // Resolve CLAUDE_PLUGIN_ROOT — it's the directory containing .mcp.json
      const { dirname } = await import('path')
      const pluginRoot = dirname(resolved)
      const output = execSync(
        `uv run "${scriptPath}" "${resolved}" "${safeName}" --json 2>/dev/null`,
        { timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot } }
      ).toString()
      const data = JSON.parse(output)
      return NextResponse.json({ tools: data.tools || [], serverInfo: data.serverInfo || null, capabilities: data.capabilities || null })
    } catch (err) {
      const errStr = String(err)
      // Try to extract JSON error from stderr
      return NextResponse.json({ error: `MCP discovery failed: ${errStr.substring(0, 500)}`, tools: [] }, { status: 500 })
    }
  }

  // Standard file content mode
  try {
    const s = await stat(resolved)
    let actualPath = resolved
    if (s.isDirectory()) {
      const skillMd = join(resolved, 'SKILL.md')
      if (existsSync(skillMd)) {
        actualPath = skillMd
      } else {
        return NextResponse.json({ error: 'Directory does not contain a readable file (no SKILL.md found)' }, { status: 404 })
      }
    }

    const content = await readFile(actualPath, 'utf-8')
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

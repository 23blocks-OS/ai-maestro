import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { rm } from 'fs/promises'
import os from 'os'
import { join, resolve, basename } from 'path'
import { isValidUuid } from '@/lib/validation'
import { getAgent } from '@/lib/agent-registry'

/**
 * POST /api/agents/[id]/remove-element
 *
 * Remove a locally-installed standalone element from an agent's project.
 * - Skills: delete folder from .claude/skills/
 * - Agents: delete .md from .claude/agents/
 * - Rules: delete .md from .claude/rules/
 * - Commands: delete .md from .claude/commands/
 * - MCP: `claude mcp remove <name>` (never edit ~/.claude.json directly)
 * - Output Styles: delete file from .claude/output-styles/
 * - Hooks: NOT supported (too fragile)
 * - LSP: NOT supported (plugin-only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 })
    }

    const agent = getAgent(id)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const body = await request.json()
    const { elementType, elementName, elementPath, workDir } = body

    if (!elementType || !elementName) {
      return NextResponse.json({ error: 'elementType and elementName are required' }, { status: 400 })
    }

    // Sanitize element name — only allow safe characters
    const safeName = String(elementName).replace(/[^a-zA-Z0-9_\-.@:]/g, '')
    if (!safeName || safeName !== elementName) {
      return NextResponse.json({ error: 'Invalid element name' }, { status: 400 })
    }

    const agentWorkDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
    if (!agentWorkDir) {
      return NextResponse.json({ error: 'Agent has no working directory' }, { status: 422 })
    }
    const claudeDir = join(resolve(agentWorkDir), '.claude')

    // Resolve the element path BEFORE snapshotting so we can capture the right file/dir
    let targetPath: string | null = null
    switch (elementType) {
      case 'skill':
        targetPath = join(claudeDir, 'skills', basename(safeName))
        if (!targetPath.startsWith(join(claudeDir, 'skills'))) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
        if (!existsSync(targetPath)) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
        break
      case 'agent':
        targetPath = join(claudeDir, 'agents', `${basename(safeName)}.md`)
        if (!targetPath.startsWith(join(claudeDir, 'agents'))) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
        if (!existsSync(targetPath)) return NextResponse.json({ error: 'Agent file not found' }, { status: 404 })
        break
      case 'rule':
        targetPath = join(claudeDir, 'rules', `${basename(safeName)}.md`)
        if (!targetPath.startsWith(join(claudeDir, 'rules'))) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
        if (!existsSync(targetPath)) return NextResponse.json({ error: 'Rule file not found' }, { status: 404 })
        break
      case 'command':
        targetPath = join(claudeDir, 'commands', `${basename(safeName)}.md`)
        if (!targetPath.startsWith(join(claudeDir, 'commands'))) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
        if (!existsSync(targetPath)) return NextResponse.json({ error: 'Command file not found' }, { status: 404 })
        break
      case 'mcp':
        // MCP uses CLI, no filesystem path to snapshot — handled separately below
        targetPath = null
        break
      case 'outputStyle':
        if (!elementPath) return NextResponse.json({ error: 'elementPath required for outputStyle' }, { status: 400 })
        targetPath = resolve(elementPath)
        if (!targetPath.startsWith(join(claudeDir, 'output-styles'))) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
        if (!existsSync(targetPath)) return NextResponse.json({ error: 'File not found' }, { status: 404 })
        break
      case 'hook':
        return NextResponse.json({ error: 'Hook removal not supported — use /hooks menu or edit settings directly' }, { status: 400 })
      case 'lsp':
        return NextResponse.json({ error: 'LSP servers can only be managed through their parent plugin' }, { status: 400 })
      default:
        return NextResponse.json({ error: `Unknown element type: ${elementType}` }, { status: 400 })
    }

    switch (elementType) {
      case 'skill':
        await rm(targetPath!, { recursive: true, force: true })
        break
      case 'agent':
      case 'rule':
      case 'command':
      case 'outputStyle':
        await rm(targetPath!)
        break
      case 'mcp':
        try {
          execSync(`claude mcp remove "${safeName}" 2>&1`, { timeout: 15000, cwd: agentWorkDir })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return NextResponse.json({ error: `MCP removal failed: ${msg}` }, { status: 500 })
        }
        break
    }

    return NextResponse.json({ ok: true, removed: safeName })
  } catch (error) {
    console.error('[remove-element] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

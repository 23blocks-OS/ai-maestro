import { NextRequest, NextResponse } from 'next/server'
import { isValidUuid } from '@/lib/validation'
import { getAgent } from '@/lib/agent-registry'
import {
  ChangeSkill,
  ChangeAgentDef,
  ChangeRule,
  ChangeCommand,
  ChangeOutputStyle,
  ChangeMCP,
} from '@/services/element-management-service'

/**
 * POST /api/agents/[id]/remove-element
 *
 * Remove a locally-installed standalone element from an agent's project.
 * Delegates to centralized Change* functions in element-management-service.
 * - Skills: ChangeSkill (remove)
 * - Agents: ChangeAgentDef (remove)
 * - Rules: ChangeRule (remove)
 * - Commands: ChangeCommand (remove)
 * - MCP: ChangeMCP (remove)
 * - Output Styles: ChangeOutputStyle (remove)
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
    const { elementType, elementName } = body

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

    // Delegate to centralized Change* functions
    switch (elementType) {
      case 'skill': {
        const r = await ChangeSkill(id, { name: safeName, action: 'remove', scope: 'local', agentDir: agentWorkDir })
        if (!r.success) return NextResponse.json({ error: r.error || 'Skill removal failed' }, { status: r.error?.includes('not found') ? 404 : 500 })
        break
      }
      case 'agent': {
        const r = await ChangeAgentDef(id, { name: safeName, action: 'remove', scope: 'local', agentDir: agentWorkDir })
        if (!r.success) return NextResponse.json({ error: r.error || 'Agent definition removal failed' }, { status: r.error?.includes('not found') ? 404 : 500 })
        break
      }
      case 'rule': {
        const r = await ChangeRule(id, { name: safeName, action: 'remove', scope: 'local', agentDir: agentWorkDir })
        if (!r.success) return NextResponse.json({ error: r.error || 'Rule removal failed' }, { status: r.error?.includes('not found') ? 404 : 500 })
        break
      }
      case 'command': {
        const r = await ChangeCommand(id, { name: safeName, action: 'remove', scope: 'local', agentDir: agentWorkDir })
        if (!r.success) return NextResponse.json({ error: r.error || 'Command removal failed' }, { status: r.error?.includes('not found') ? 404 : 500 })
        break
      }
      case 'outputStyle': {
        const r = await ChangeOutputStyle(id, { name: safeName, action: 'remove', scope: 'local', agentDir: agentWorkDir })
        if (!r.success) return NextResponse.json({ error: r.error || 'Output style removal failed' }, { status: r.error?.includes('not found') ? 404 : 500 })
        break
      }
      case 'mcp': {
        const r = await ChangeMCP(id, { name: safeName, action: 'remove', scope: 'local', agentDir: agentWorkDir })
        if (!r.success) return NextResponse.json({ error: r.error || 'MCP removal failed' }, { status: 500 })
        break
      }
      case 'hook':
        return NextResponse.json({ error: 'Hook removal not supported — use /hooks menu or edit settings directly' }, { status: 400 })
      case 'lsp':
        return NextResponse.json({ error: 'LSP servers can only be managed through their parent plugin' }, { status: 400 })
      default:
        return NextResponse.json({ error: `Unknown element type: ${elementType}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true, removed: safeName })
  } catch (error) {
    console.error('[remove-element] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

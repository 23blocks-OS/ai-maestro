import { NextRequest, NextResponse } from 'next/server'
import { getAgentBySession } from '@/lib/agent-registry'

export const dynamic = 'force-dynamic'

function execCommand(cmd: string): string {
  const { execSync } = require('child_process')
  return execSync(cmd, { timeout: 5000, encoding: 'utf8' }).trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getPaneCommand(sessionName: string): string | null {
  try {
    return execCommand(`tmux display-message -p -t "${sessionName}" '#{pane_current_command}'`) || null
  } catch {
    return null
  }
}

const SHELL_COMMANDS = new Set(['zsh', 'bash', 'sh', 'fish', '-zsh', '-bash'])

/**
 * POST /api/sessions/[id]/restart
 * Orchestrates a full restart: sends /exit, waits for shell prompt, relaunches the program.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionName } = await params

  // Get agent info for relaunch command
  const agent = getAgentBySession(sessionName)

  let body: { program?: string; programArgs?: string } = {}
  try { body = await request.json() } catch { /* optional body */ }

  const program = body.program || agent?.program || 'claude'
  const programArgs = body.programArgs || agent?.programArgs || ''

  // Resolve program name to CLI binary
  const resolveBin = (p: string): string => {
    const lower = p.toLowerCase()
    if (lower.includes('claude')) return 'claude'
    if (lower.includes('codex')) return 'codex'
    if (lower.includes('aider')) return 'aider'
    if (lower.includes('gemini')) return 'gemini'
    return 'claude'
  }

  try {
    // 1. Send /exit
    execCommand(`tmux send-keys -t "${sessionName}" '/exit' Enter`)

    // 2. Poll until the program exits (shell prompt visible)
    const maxWait = 15000
    const pollInterval = 500
    let elapsed = 0
    let exited = false

    while (elapsed < maxWait) {
      await sleep(pollInterval)
      elapsed += pollInterval
      const paneCmd = getPaneCommand(sessionName)
      if (!paneCmd || SHELL_COMMANDS.has(paneCmd)) {
        exited = true
        break
      }
    }

    if (!exited) {
      return NextResponse.json({ error: 'Timeout: program did not exit within 15s' }, { status: 504 })
    }

    // 3. Brief pause for shell readiness
    await sleep(1000)

    // 4. Build and send relaunch command
    const bin = resolveBin(program)
    const cmd = `${bin} ${programArgs}`.trim()
    execCommand(`tmux send-keys -t "${sessionName}" '${cmd.replace(/'/g, "'\\''")}' Enter`)

    return NextResponse.json({ success: true, sessionName, command: cmd })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

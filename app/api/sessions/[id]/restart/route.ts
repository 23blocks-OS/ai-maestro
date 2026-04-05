/**
 * POST /api/sessions/[id]/restart
 *
 * Orchestrates a full graceful restart of a Claude Code (or other AI program)
 * session running inside tmux. The restart is a 4-step sequence:
 *
 *   Step 1: Send `/exit` to the tmux pane — Claude interprets this as a
 *           clean shutdown request and exits gracefully.
 *   Step 2: Poll the tmux pane's current command every 500ms for up to 15s.
 *           When the pane command becomes a shell (zsh, bash, etc.), the AI
 *           program has exited and the shell prompt is visible.
 *   Step 3: Wait 1s for the shell to fully initialize (prompt rendering,
 *           rc file sourcing, etc.).
 *   Step 4: Send the relaunch command (e.g. `claude --agent my-plugin-main-agent`)
 *           to restart the AI program with the same arguments.
 *
 * **Callers:** The profile panel's Restart button, and the useRestartQueue hook
 * (which defers the call until the agent reaches idle_prompt safe state).
 *
 * **Timeout:** Returns HTTP 504 if the program doesn't exit within 15 seconds.
 *
 * **Request body (optional):**
 *   - `program`: display name of the AI program (resolved to CLI binary)
 *   - `programArgs`: CLI arguments to pass on relaunch
 *
 * Falls back to the agent registry's stored program/programArgs, then to 'claude'.
 */
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

/** Query tmux for the process currently running in the session's pane. */
function getPaneCommand(sessionName: string): string | null {
  try {
    return execCommand(`tmux display-message -p -t "${sessionName}" '#{pane_current_command}'`) || null
  } catch {
    return null
  }
}

/** Shell process names that indicate the AI program has exited and the pane
 *  is back at a shell prompt (ready to accept a new launch command). */
const SHELL_COMMANDS = new Set(['zsh', 'bash', 'sh', 'fish', '-zsh', '-bash'])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionName } = await params

  // Look up the agent's stored program and args from the registry
  const agent = getAgentBySession(sessionName)

  // Manager gate: team agents cannot restart without a MANAGER on the host
  if (agent) {
    const { getManagerId } = await import('@/lib/governance')
    const { isAgentInAnyTeam } = await import('@/lib/team-registry')
    if (!getManagerId() && isAgentInAnyTeam(agent.id)) {
      return NextResponse.json(
        { error: 'Cannot restart team agent: no MANAGER exists on this host. Assign a MANAGER first.' },
        { status: 403 }
      )
    }
  }

  let body: { program?: string; programArgs?: string } = {}
  try { body = await request.json() } catch { /* optional body */ }

  const program = body.program || agent?.program || 'claude'
  const programArgs = body.programArgs || agent?.programArgs || ''

  // Resolve display program name (e.g. "Claude Code") to the actual CLI binary name
  const resolveBin = (p: string): string => {
    const lower = p.toLowerCase()
    if (lower.includes('claude')) return 'claude'
    if (lower.includes('codex')) return 'codex'
    if (lower.includes('aider')) return 'aider'
    if (lower.includes('gemini')) return 'gemini'
    return 'claude'
  }

  try {
    // Step 1: Ctrl+C clears partial input, /exit as literal text exits Claude Code
    // Note: Ctrl+D does NOT exit Claude Code. Only /exit works.
    execCommand(`tmux send-keys -t "${sessionName}" C-c`)
    execCommand(`tmux send-keys -t "${sessionName}" -l '/exit'`)
    execCommand(`tmux send-keys -t "${sessionName}" Enter`)

    // Step 2: Poll tmux pane command every 500ms until it becomes a shell
    // (meaning the AI program exited and the shell prompt is back)
    const maxWait = 15000  // 15 second timeout
    const pollInterval = 500
    let elapsed = 0
    let exited = false

    while (elapsed < maxWait) {
      await sleep(pollInterval)
      elapsed += pollInterval
      const paneCmd = getPaneCommand(sessionName)
      // If pane command is null (session gone) or a shell, the program exited
      if (!paneCmd || SHELL_COMMANDS.has(paneCmd)) {
        exited = true
        break
      }
    }

    if (!exited) {
      return NextResponse.json({ error: 'Timeout: program did not exit within 15s' }, { status: 504 })
    }

    // Step 3: Brief pause for shell readiness (rc files, prompt rendering)
    await sleep(1000)

    // Step 4: Build and send the relaunch command into the tmux pane
    const bin = resolveBin(program)
    // Ensure --name <persona> is always present in the args
    const personaName = agent?.label || agent?.name || sessionName
    let finalArgs = programArgs
    if (!finalArgs.includes('--name ')) {
      // Insert --name before any -- divider (raw prompt passthrough), or at the end
      const dividerIdx = finalArgs.indexOf(' -- ')
      if (dividerIdx !== -1) {
        finalArgs = finalArgs.slice(0, dividerIdx) + ` --name "${personaName}"` + finalArgs.slice(dividerIdx)
      } else {
        finalArgs = `${finalArgs} --name "${personaName}"`.trim()
      }
    }
    const cmd = `${bin} ${finalArgs}`.trim()
    execCommand(`tmux send-keys -t "${sessionName}" '${cmd.replace(/'/g, "'\\''")}' Enter`)

    return NextResponse.json({ success: true, sessionName, command: cmd })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

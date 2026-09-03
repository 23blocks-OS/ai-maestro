/**
 * Agent Runtime Abstraction
 *
 * Consolidates ALL tmux operations behind a single TmuxRuntime class
 * implementing the AgentRuntime interface. Future runtimes (Docker, API-only,
 * direct-process) can be plugged in without touching business logic.
 *
 * Phase 4 of the service-layer refactoring.
 */

import { exec, execFileSync as nodeExecFileSync } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface DiscoveredSession {
  name: string
  windows: number
  createdAt: string
  workingDirectory: string
}

export interface AgentRuntime {
  readonly type: 'tmux' | 'docker' | 'api' | 'direct'

  // Discovery
  listSessions(): Promise<DiscoveredSession[]>

  // Existence / status
  sessionExists(name: string): Promise<boolean>
  getWorkingDirectory(name: string): Promise<string>
  isInCopyMode(name: string): Promise<boolean>
  cancelCopyMode(name: string): Promise<void>
  /**
   * Pane properties that plausibly affect whether typed text SUBMITS.
   *
   * Optional: a runtime that cannot introspect its pane simply omits it, and
   * callers treat the absence as "unknown" rather than as a value.
   */
  describePane?(name: string): Promise<Record<string, string>>

  // Lifecycle
  createSession(name: string, cwd: string): Promise<void>
  killSession(name: string): Promise<void>
  renameSession(oldName: string, newName: string): Promise<void>

  // I/O
  sendKeys(name: string, keys: string, opts?: { literal?: boolean; enter?: boolean }): Promise<void>
  capturePane(name: string, lines?: number): Promise<string>

  // Environment
  setEnvironment(name: string, key: string, value: string): Promise<void>
  unsetEnvironment(name: string, key: string): Promise<void>

  // PTY (returns spawn args for node-pty -- runtime doesn't own the PTY)
  getAttachCommand(name: string, socketPath?: string): { command: string; args: string[] }
}

// ---------------------------------------------------------------------------
// TmuxRuntime
// ---------------------------------------------------------------------------

export class TmuxRuntime implements AgentRuntime {
  readonly type = 'tmux' as const

  // -- Discovery -----------------------------------------------------------

  async listSessions(): Promise<DiscoveredSession[]> {
    try {
      const { stdout } = await execAsync('tmux list-sessions 2>/dev/null || echo ""')
      if (!stdout.trim()) return []

      const lines = stdout.trim().split('\n')
      const results: DiscoveredSession[] = []

      for (const line of lines) {
        const match = line.match(/^([^:]+):\s+(\d+)\s+windows?\s+\(created\s+(.+?)\)/)
        if (!match) continue

        const [, name, windows, createdStr] = match
        const normalizedDate = createdStr.trim().replace(/\s+/g, ' ')

        let createdAt: string
        try {
          const parsedDate = new Date(normalizedDate)
          createdAt = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString()
        } catch {
          createdAt = new Date().toISOString()
        }

        let workingDirectory = ''
        try {
          const { stdout: cwdOutput } = await execAsync(
            `tmux display-message -t "${name}" -p "#{pane_current_path}" 2>/dev/null || echo ""`
          )
          workingDirectory = cwdOutput.trim()
        } catch {
          workingDirectory = ''
        }

        results.push({
          name,
          windows: parseInt(windows, 10),
          createdAt,
          workingDirectory,
        })
      }

      return results
    } catch {
      return []
    }
  }

  // -- Existence / status --------------------------------------------------

  async sessionExists(name: string): Promise<boolean> {
    try {
      await execAsync(`tmux has-session -t "${name}" 2>/dev/null`)
      return true
    } catch {
      return false
    }
  }

  async getWorkingDirectory(name: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `tmux display-message -t "${name}" -p "#{pane_current_path}" 2>/dev/null || echo ""`
      )
      return stdout.trim()
    } catch {
      return ''
    }
  }

  async isInCopyMode(name: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `tmux display-message -t "${name}" -p "#{pane_in_mode}"`
      )
      return stdout.trim() === '1'
    } catch {
      return false
    }
  }

  /**
   * Pane properties captured when a wake fails, so the reason can be found
   * rather than argued about.
   *
   * The staged-text failure does not hit every agent, which means something
   * differs between the ones it hits and the ones it does not. Rather than
   * theorise, record the candidates at the moment of failure: width (a narrow
   * pane wraps the same notification into more lines, which is what pushes a
   * TUI into treating it as a multi-line paste rather than a typed prompt),
   * whether the alternate screen is on (the fullscreen renderer handles input
   * differently and keeps no scrollback, so it also breaks the readback), and
   * whether the pane is in copy mode or running something other than the agent.
   */
  async describePane(name: string): Promise<Record<string, string>> {
    const FORMAT = [
      'width=#{pane_width}',
      'height=#{pane_height}',
      'alternate_on=#{alternate_on}',
      'history_size=#{history_size}',
      'in_mode=#{pane_in_mode}',
      'command=#{pane_current_command}',
      // Session start, because `command` carries the Claude Code VERSION and a
      // version field looks like a property while behaving like a timestamp.
      // Claude Code auto-updates itself with no announcement, so a long-running
      // session is pinned to whatever binary existed when it started. 3Metas
      // spent real time reading a version column as "these agents share a
      // property" when it only meant "these agents started at the same time".
      // Recording when the session began makes that legible instead of a trap
      // for the next person reading these logs.
      'session_created=#{session_created}',
    ].join(' ')
    try {
      const { stdout } = await execAsync(`tmux display-message -t "${name}" -p "${FORMAT}"`)
      return Object.fromEntries(
        stdout
          .trim()
          .split(' ')
          .map(pair => {
            const at = pair.indexOf('=')
            return at === -1 ? [pair, ''] : [pair.slice(0, at), pair.slice(at + 1)]
          })
      )
    } catch {
      return {}
    }
  }

  async cancelCopyMode(name: string): Promise<void> {
    try {
      const inCopyMode = await this.isInCopyMode(name)
      if (!inCopyMode) return

      // Stage 1: Escape dismisses any command-prompt overlay + exits plain copy-mode
      await execAsync(`tmux send-keys -t "${name}" Escape`)
      await new Promise(resolve => setTimeout(resolve, 30))

      // Stage 2: belt-and-suspenders. If Stage 1 only dismissed the overlay,
      // force-exit with q.
      const stillInCopyMode = await this.isInCopyMode(name)
      if (stillInCopyMode) {
        await execAsync(`tmux send-keys -t "${name}" q`)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    } catch {
      // Non-fatal: caller's send-keys will surface the underlying tmux error
    }
  }

  // -- Lifecycle -----------------------------------------------------------

  async createSession(name: string, cwd: string): Promise<void> {
    // Unset TMUX so tmux doesn't try to use a stale parent socket
    const env = { ...process.env, TMUX: undefined }
    await execAsync(`tmux new-session -d -s "${name}" -c "${cwd}"`, { env })
  }

  async killSession(name: string): Promise<void> {
    await execAsync(`tmux kill-session -t "${name}"`)
  }

  async renameSession(oldName: string, newName: string): Promise<void> {
    await execAsync(`tmux rename-session -t "${oldName}" "${newName}"`)
  }

  // -- I/O -----------------------------------------------------------------

  async sendKeys(
    name: string,
    keys: string,
    opts: { literal?: boolean; enter?: boolean } = {}
  ): Promise<void> {
    const { literal = false, enter = false } = opts

    if (literal) {
      const escaped = keys.replace(/'/g, "'\\''")
      await execAsync(`tmux send-keys -t "${name}" -l '${escaped}'`)
      if (enter) {
        // Send Enter separately with a delay so TUIs (Claude Code, Codex)
        // process the literal text before receiving the submit. Without this,
        // Enter can arrive in the same tmux tick and be processed before the
        // input field updates, causing the submit to be silently lost.
        await new Promise(r => setTimeout(r, 100))
        await execAsync(`tmux send-keys -t "${name}" Enter`)
      }
    } else {
      // Non-literal: keys is a raw key sequence (e.g. "C-c", "exit Enter", quoted command)
      if (enter) {
        await execAsync(`tmux send-keys -t "${name}" ${keys} Enter`)
      } else {
        await execAsync(`tmux send-keys -t "${name}" ${keys}`)
      }
    }
  }

  async capturePane(name: string, lines: number = 2000): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `tmux capture-pane -t "${name}" -p -S -${lines} 2>/dev/null || tmux capture-pane -t "${name}" -p`,
        { encoding: 'utf8', timeout: 3000, shell: '/bin/bash' }
      )
      return stdout
    } catch {
      return ''
    }
  }

  // -- Environment ---------------------------------------------------------

  async setEnvironment(name: string, key: string, value: string): Promise<void> {
    await execAsync(`tmux set-environment -t "${name}" ${key} "${value}"`)
  }

  async unsetEnvironment(name: string, key: string): Promise<void> {
    await execAsync(`tmux set-environment -t "${name}" -r ${key} 2>/dev/null || true`)
  }

  // -- PTY -----------------------------------------------------------------

  getAttachCommand(name: string, socketPath?: string): { command: string; args: string[] } {
    if (socketPath) {
      return { command: 'tmux', args: ['-S', socketPath, 'attach-session', '-t', name] }
    }
    return { command: 'tmux', args: ['attach-session', '-t', name] }
  }
}

// ---------------------------------------------------------------------------
// Singleton + factory
// ---------------------------------------------------------------------------

let defaultRuntime: AgentRuntime = new TmuxRuntime()

export function getRuntime(): AgentRuntime {
  return defaultRuntime
}

export function setRuntime(r: AgentRuntime): void {
  defaultRuntime = r
}

// ---------------------------------------------------------------------------
// Sync helpers for lib/agent-registry.ts (uses execSync, can't be async)
// ---------------------------------------------------------------------------

export function sessionExistsSync(name: string, socketPath?: string): boolean {
  try {
    const args = socketPath
      ? ['-S', socketPath, 'has-session', '-t', name]
      : ['has-session', '-t', name]
    nodeExecFileSync('tmux', args, { timeout: 2000, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function killSessionSync(name: string): void {
  try {
    nodeExecFileSync('tmux', ['kill-session', '-t', name], { encoding: 'utf-8', stdio: 'ignore' })
  } catch {
    // Session may not exist
  }
}

export function renameSessionSync(oldName: string, newName: string): void {
  nodeExecFileSync('tmux', ['rename-session', '-t', oldName, newName], { encoding: 'utf-8' })
}

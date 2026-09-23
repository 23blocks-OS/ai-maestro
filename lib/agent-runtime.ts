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
// SECURITY (GHSA-2vm8-3q4q-wqv3): every tmux call below goes through these.
// They use execFile with an argument vector and reject malformed session names,
// so no caller can reach a shell with attacker-controlled text. See the header
// of lib/tmux-safe.mjs for why validation lives here and not at the routes.
import { tmux, assertSessionName, splitKeySpec } from '@/lib/tmux-safe.mjs'

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
  /** Capture WITH escape sequences, to tell dim placeholder from real input. */
  capturePaneRaw(name: string, lines?: number): Promise<string>
  /** Press one key N times (clearing an input box with backspaces). */
  repeatKey(name: string, key: string, times: number): Promise<void>

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
    // One tmux call for every session's name, windows, creation time and cwd.
    // The per-session `display-message` below ran once per session, in series:
    // 36 sessions ≈ 1.8 s, which was most of GET /api/agents; under load it
    // passed the dashboard's 8 s timeout and the agent list reset (2026-09-23).
    try {
      const { stdout } = await tmux(['list-sessions', '-F', '#{session_name}\t#{session_windows}\t#{session_created}\t#{pane_current_path}'])
      const rows = stdout.split('\n').filter(Boolean).map(line => line.split('\t'))
      if (rows.length > 0 && rows.every(r => r.length === 4 && /^\d+$/.test(r[1]) && /^\d+$/.test(r[2]))) {
        return rows.map(([name, windows, created, cwd]) => ({
          name,
          windows: parseInt(windows, 10),
          createdAt: new Date(parseInt(created, 10) * 1000).toISOString(),
          workingDirectory: cwd,
        }))
      }
      if (!stdout.trim()) return []
    } catch {
      // no tmux server, or a tmux without -F formats: fall through
    }
    return this.listSessionsOneByOne()
  }

  /** The original discovery: one `display-message` per session. Fallback only. */
  private async listSessionsOneByOne(): Promise<DiscoveredSession[]> {
    try {
      let stdout = ''
      try {
        ({ stdout } = await tmux(['list-sessions']))
      } catch {
        return []  // no server running — the old `|| echo ""` case
      }
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
          // Name came from tmux's own output, so it is not attacker-supplied —
          // argv form regardless, and NO assert, or a pre-existing session with
          // an unusual name would silently vanish from discovery.
          const { stdout: cwdOutput } = await tmux(
            ['display-message', '-t', name, '-p', '#{pane_current_path}']
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
      await tmux(['has-session', '-t', assertSessionName(name)])
      return true
    } catch {
      return false
    }
  }

  async getWorkingDirectory(name: string): Promise<string> {
    try {
      const { stdout } = await tmux(
        ['display-message', '-t', assertSessionName(name), '-p', '#{pane_current_path}']
      )
      return stdout.trim()
    } catch {
      return ''
    }
  }

  async isInCopyMode(name: string): Promise<boolean> {
    try {
      const { stdout } = await tmux(
        ['display-message', '-t', assertSessionName(name), '-p', '#{pane_in_mode}']
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
      const { stdout } = await tmux(['display-message', '-t', assertSessionName(name), '-p', FORMAT])
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
      await tmux(['send-keys', '-t', assertSessionName(name), 'Escape'])
      await new Promise(resolve => setTimeout(resolve, 30))

      // Stage 2: belt-and-suspenders. If Stage 1 only dismissed the overlay,
      // force-exit with q.
      const stillInCopyMode = await this.isInCopyMode(name)
      if (stillInCopyMode) {
        await tmux(['send-keys', '-t', assertSessionName(name), 'q'])
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
    await tmux(['new-session', '-d', '-s', assertSessionName(name), '-c', cwd], { env })
  }

  async killSession(name: string): Promise<void> {
    await tmux(['kill-session', '-t', assertSessionName(name)])
  }

  async renameSession(oldName: string, newName: string): Promise<void> {
    await tmux(['rename-session', '-t', assertSessionName(oldName), assertSessionName(newName)])
  }

  // -- I/O -----------------------------------------------------------------

  async sendKeys(
    name: string,
    keys: string,
    opts: { literal?: boolean; enter?: boolean } = {}
  ): Promise<void> {
    const { literal = false, enter = false } = opts

    if (literal) {
      // No escaping: -l takes the text as one argv entry, verbatim.
      await tmux(['send-keys', '-t', assertSessionName(name), '-l', keys])
      if (enter) {
        // Send Enter separately with a delay so TUIs (Claude Code, Codex)
        // process the literal text before receiving the submit. Without this,
        // Enter can arrive in the same tmux tick and be processed before the
        // input field updates, causing the submit to be silently lost.
        await new Promise(r => setTimeout(r, 100))
        await tmux(['send-keys', '-t', assertSessionName(name), 'Enter'])
      }
    } else {
      // Non-literal: keys is a raw key sequence (e.g. "C-c", "exit Enter", quoted command)
      if (enter) {
        await tmux(['send-keys', '-t', assertSessionName(name), ...splitKeySpec(keys), 'Enter'])
      } else {
        await tmux(['send-keys', '-t', assertSessionName(name), ...splitKeySpec(keys)])
      }
    }
  }

  /**
   * Press one key N times. Used to clear a TUI input box with backspaces —
   * `C-u` does not clear Claude Code's input, backspace does. tmux -N repeats
   * in a single call, so this stays one exec no matter how long the text is.
   */
  async repeatKey(name: string, key: string, times: number): Promise<void> {
    const n = Math.max(1, Math.min(2000, Math.floor(times)))
    await tmux(['send-keys', '-t', assertSessionName(name), '-N', String(n), ...splitKeySpec(key)])
  }

  /**
   * Capture WITH escape sequences, so callers can tell Claude Code's dim
   * placeholder from text that is really staged. See stripDimPlaceholder.
   */
  async capturePaneRaw(name: string, lines: number = 200): Promise<string> {
    try {
      // The shell `||` fallback became a JS try/catch — same behaviour, no shell.
      const session = assertSessionName(name)
      const n = Math.max(1, Math.min(100000, Math.floor(lines)))
      try {
        const { stdout } = await tmux(
          ['capture-pane', '-t', session, '-p', '-e', '-S', `-${n}`], { timeout: 3000 }
        )
        return stdout
      } catch {
        const { stdout } = await tmux(['capture-pane', '-t', session, '-p', '-e'], { timeout: 3000 })
        return stdout
      }
    } catch {
      return ''
    }
  }

  async capturePane(name: string, lines: number = 2000): Promise<string> {
    try {
      const session = assertSessionName(name)
      const n = Math.max(1, Math.min(100000, Math.floor(lines)))
      try {
        const { stdout } = await tmux(
          ['capture-pane', '-t', session, '-p', '-S', `-${n}`], { timeout: 3000 }
        )
        return stdout
      } catch {
        const { stdout } = await tmux(['capture-pane', '-t', session, '-p'], { timeout: 3000 })
        return stdout
      }
    } catch {
      return ''
    }
  }

  // -- Environment ---------------------------------------------------------

  async setEnvironment(name: string, key: string, value: string): Promise<void> {
    await tmux(['set-environment', '-t', assertSessionName(name), key, value])
  }

  async unsetEnvironment(name: string, key: string): Promise<void> {
    try {
      await tmux(['set-environment', '-t', assertSessionName(name), '-r', key])
    } catch {
      // `|| true` in the old shell string: unsetting something already unset is fine.
    }
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

/**
 * Agent Runtime Abstraction
 *
 * Consolidates ALL tmux operations behind a single TmuxRuntime class
 * implementing the AgentRuntime interface. Future runtimes (Docker, API-only,
 * direct-process) can be plugged in without touching business logic.
 *
 * Phase 4 of the service-layer refactoring.
 */

import { execFile, execFileSync as nodeExecFileSync } from 'child_process'
import { promisify } from 'util'

// Shell-free command execution — prevents shell injection by passing args as array
const execFileAsync = promisify(execFile)

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
      // Use execFileAsync (no shell) for tmux list-sessions
      let stdout: string
      try {
        const result = await execFileAsync('tmux', ['list-sessions'])
        stdout = result.stdout
      } catch {
        // tmux not running or no sessions — return empty list
        return []
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
          // Use execFileAsync (no shell) to prevent shell injection via session name
          const { stdout: cwdOutput } = await execFileAsync(
            'tmux', ['display-message', '-t', name, '-p', '#{pane_current_path}']
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
      // Use execFileAsync (no shell) to prevent shell injection via session name
      await execFileAsync('tmux', ['has-session', '-t', name])
      return true
    } catch {
      return false
    }
  }

  async getWorkingDirectory(name: string): Promise<string> {
    try {
      // Use execFileAsync (no shell) to prevent shell injection via session name
      const { stdout } = await execFileAsync(
        'tmux', ['display-message', '-t', name, '-p', '#{pane_current_path}']
      )
      return stdout.trim()
    } catch {
      return ''
    }
  }

  async isInCopyMode(name: string): Promise<boolean> {
    try {
      // Use execFileAsync (no shell) to prevent shell injection via session name
      const { stdout } = await execFileAsync(
        'tmux', ['display-message', '-t', name, '-p', '#{pane_in_mode}']
      )
      return stdout.trim() === '1'
    } catch {
      return false
    }
  }

  async cancelCopyMode(name: string): Promise<void> {
    try {
      const inCopyMode = await this.isInCopyMode(name)
      if (inCopyMode) {
        // Use execFileAsync (no shell) to prevent shell injection via session name
        await execFileAsync('tmux', ['send-keys', '-t', name, 'q'])
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    } catch {
      // Ignore
    }
  }

  // -- Lifecycle -----------------------------------------------------------

  async createSession(name: string, cwd: string): Promise<void> {
    // Use execFileAsync (no shell) to prevent shell injection via name/cwd
    await execFileAsync('tmux', ['new-session', '-d', '-s', name, '-c', cwd])
  }

  async killSession(name: string): Promise<void> {
    // Use execFileAsync (no shell) to prevent shell injection via session name
    await execFileAsync('tmux', ['kill-session', '-t', name])
  }

  async renameSession(oldName: string, newName: string): Promise<void> {
    // Use execFileAsync (no shell) to prevent shell injection via session names
    await execFileAsync('tmux', ['rename-session', '-t', oldName, newName])
  }

  // -- I/O -----------------------------------------------------------------

  async sendKeys(
    name: string,
    keys: string,
    opts: { literal?: boolean; enter?: boolean } = {}
  ): Promise<void> {
    const { literal = false, enter = false } = opts

    if (literal) {
      // Literal mode: use -l flag so tmux treats keys as literal text
      if (enter) {
        // Two separate execFileAsync calls — execFile has no shell so \\; chaining is unavailable
        await execFileAsync('tmux', ['send-keys', '-t', name, '-l', keys])
        await execFileAsync('tmux', ['send-keys', '-t', name, 'Enter'])
      } else {
        await execFileAsync('tmux', ['send-keys', '-t', name, '-l', keys])
      }
    } else {
      // Non-literal: keys is a raw tmux key name (e.g. "C-c", "Enter", "Escape")
      // Use execFileAsync (array args, no shell) to prevent shell injection (CC-P1-501)
      const args = ['send-keys', '-t', name, keys]
      if (enter) {
        args.push('Enter')
      }
      await execFileAsync('tmux', args)
    }
  }

  async capturePane(name: string, lines: number = 2000): Promise<string> {
    try {
      // Use execFileAsync (no shell) to prevent shell injection via session name
      // Try full history capture first, fall back to visible pane on error
      const { stdout } = await execFileAsync(
        'tmux', ['capture-pane', '-t', name, '-p', '-S', `-${lines}`],
        { encoding: 'utf8', timeout: 3000 }
      )
      return stdout
    } catch {
      try {
        // Fallback: capture only visible pane content
        const { stdout } = await execFileAsync(
          'tmux', ['capture-pane', '-t', name, '-p'],
          { encoding: 'utf8', timeout: 3000 }
        )
        return stdout
      } catch {
        return ''
      }
    }
  }

  // -- Environment ---------------------------------------------------------

  async setEnvironment(name: string, key: string, value: string): Promise<void> {
    // Use execFileAsync (array args, no shell) to prevent shell injection (CC-P1-502)
    await execFileAsync('tmux', ['set-environment', '-t', name, key, value])
  }

  async unsetEnvironment(name: string, key: string): Promise<void> {
    // Use execFileAsync (array args, no shell) to prevent shell injection
    try {
      await execFileAsync('tmux', ['set-environment', '-t', name, '-r', key])
    } catch {
      // Variable may not exist — equivalent to the old 2>/dev/null || true
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
    // Use nodeExecFileSync (no shell) to prevent shell injection via session name
    nodeExecFileSync('tmux', ['kill-session', '-t', name], { timeout: 2000, stdio: 'ignore' })
  } catch {
    // Session may not exist
  }
}

export function renameSessionSync(oldName: string, newName: string): void {
  // Use nodeExecFileSync (array args, no shell) to prevent shell injection (CC-P1-503)
  nodeExecFileSync('tmux', ['rename-session', '-t', oldName, newName])
}

/**
 * Agent Runtime Abstraction
 *
 * Consolidates ALL tmux operations behind a single TmuxRuntime class
 * implementing the AgentRuntime interface. Future runtimes (Docker, API-only,
 * direct-process) can be plugged in without touching business logic.
 *
 * Phase 4 of the service-layer refactoring.
 */

import { exec, execSync as nodeExecSync } from 'child_process'
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
  getAttachCommand(name: string): { command: string; args: string[] }
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

  async cancelCopyMode(name: string): Promise<void> {
    try {
      const inCopyMode = await this.isInCopyMode(name)
      if (inCopyMode) {
        await execAsync(`tmux send-keys -t "${name}" q`)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    } catch {
      // Ignore
    }
  }

  // -- Lifecycle -----------------------------------------------------------

  async createSession(name: string, cwd: string): Promise<void> {
    await execAsync(`tmux new-session -d -s "${name}" -c "${cwd}"`)
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
      if (enter) {
        await execAsync(
          `tmux send-keys -t "${name}" -l '${escaped}' \\; send-keys -t "${name}" Enter`
        )
      } else {
        await execAsync(`tmux send-keys -t "${name}" -l '${escaped}'`)
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

  getAttachCommand(name: string): { command: string; args: string[] } {
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

export function sessionExistsSync(name: string): boolean {
  try {
    nodeExecSync(`tmux has-session -t "${name}" 2>/dev/null`, { timeout: 2000 })
    return true
  } catch {
    return false
  }
}

export function killSessionSync(name: string): void {
  try {
    nodeExecSync(`tmux kill-session -t "${name}" 2>/dev/null || true`, { encoding: 'utf-8' })
  } catch {
    // Session may not exist
  }
}

export function renameSessionSync(oldName: string, newName: string): void {
  nodeExecSync(`tmux rename-session -t "${oldName}" "${newName}"`)
}

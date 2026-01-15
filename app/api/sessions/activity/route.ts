import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as os from 'os'
import { loadAgents } from '@/lib/agent-registry'

// Disable caching - this endpoint reads from global state that changes frequently
export const dynamic = 'force-dynamic'
export const revalidate = 0

// This will be populated by server.mjs via global state
declare global {
  var sessionActivity: Map<string, number> | undefined
}

// Hash working directory to find state file (same as in hook and chat route)
function hashCwd(cwd: string): string {
  return crypto.createHash('md5').update(cwd || '').digest('hex').substring(0, 16)
}

// Read hook state for a given working directory
function getHookState(workingDir: string): { status: string; notificationType?: string } | null {
  if (!workingDir) return null

  const stateDir = path.join(os.homedir(), '.aimaestro', 'chat-state')
  const cwdHash = hashCwd(workingDir)
  const stateFile = path.join(stateDir, `${cwdHash}.json`)

  try {
    if (fs.existsSync(stateFile)) {
      const content = fs.readFileSync(stateFile, 'utf-8')
      const state = JSON.parse(content)

      // Check if state is fresh enough (within 60 seconds for non-waiting states)
      const isWaitingState = state.status === 'waiting_for_input' || state.status === 'permission_request'
      if (!isWaitingState) {
        const stateAge = Date.now() - new Date(state.updatedAt).getTime()
        if (stateAge > 60000) {
          return null
        }
      }

      return {
        status: state.status,
        notificationType: state.notificationType
      }
    }
  } catch (err) {
    // Ignore errors reading state files
  }

  return null
}

export type SessionActivityStatus = 'active' | 'idle' | 'waiting'

interface SessionActivityInfo {
  lastActivity: string
  status: SessionActivityStatus
  hookStatus?: string
  notificationType?: string
}

export async function GET() {
  try {
    const activityMap = global.sessionActivity || new Map()
    const activity: Record<string, SessionActivityInfo> = {}

    // Get all agents to map sessions to working directories
    const agents = loadAgents()
    const sessionToWorkingDir = new Map<string, string>()

    for (const agent of agents) {
      const sessionName = agent.name || agent.alias
      const workingDir = agent.workingDirectory ||
                         agent.sessions?.[0]?.workingDirectory ||
                         agent.preferences?.defaultWorkingDirectory

      if (sessionName && workingDir) {
        sessionToWorkingDir.set(sessionName, workingDir)
      }
    }

    const now = Date.now()
    activityMap.forEach((timestamp, sessionName) => {
      const secondsSinceActivity = (now - timestamp) / 1000
      const terminalIdle = secondsSinceActivity > 3

      // Check hook state for this session
      const workingDir = sessionToWorkingDir.get(sessionName)
      const hookState = workingDir ? getHookState(workingDir) : null

      // Determine status:
      // - 'waiting' if hook says waiting_for_input or permission_request
      // - 'active' if terminal had recent output (Claude is working)
      // - 'idle' if no recent activity and not waiting
      let status: SessionActivityStatus = terminalIdle ? 'idle' : 'active'

      if (hookState && (hookState.status === 'waiting_for_input' || hookState.status === 'permission_request')) {
        status = 'waiting'
      }

      activity[sessionName] = {
        lastActivity: new Date(timestamp).toISOString(),
        status,
        hookStatus: hookState?.status,
        notificationType: hookState?.notificationType
      }
    })

    return NextResponse.json({ activity })
  } catch (error) {
    console.error('Failed to fetch activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity', activity: {} },
      { status: 500 }
    )
  }
}

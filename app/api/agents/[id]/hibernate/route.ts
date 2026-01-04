import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getAgent, loadAgents, saveAgents } from '@/lib/agent-registry'
import { unpersistSession } from '@/lib/session-persistence'
import { computeSessionName } from '@/types/agent'

const execAsync = promisify(exec)

/**
 * Check if a tmux session exists
 */
async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  try {
    await execAsync(`tmux has-session -t "${sessionName}" 2>/dev/null`)
    return true
  } catch {
    return false
  }
}

/**
 * POST /api/agents/[id]/hibernate
 *
 * Hibernate an agent by:
 * 1. Gracefully stopping Claude Code (send Ctrl+C, then exit)
 * 2. Killing the tmux session
 * 3. Updating agent status to 'offline' and session status to 'offline'
 *
 * The agent's configuration (working directory, etc.) is preserved so it can be woken up later.
 *
 * Optional body parameters:
 * - sessionIndex: number - Which session to hibernate (default: 0)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Parse optional body for sessionIndex
    let sessionIndex = 0
    try {
      const body = await request.json()
      if (typeof body.sessionIndex === 'number') {
        sessionIndex = body.sessionIndex
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Get the agent
    const agent = getAgent(id)
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    // Get agent name (new field, fallback to deprecated alias)
    const agentName = agent.name || agent.alias
    if (!agentName) {
      return NextResponse.json(
        { error: 'Agent has no name configured' },
        { status: 400 }
      )
    }

    // Compute the tmux session name from agent name and index
    const sessionName = computeSessionName(agentName, sessionIndex)

    // Check if session exists
    const exists = await tmuxSessionExists(sessionName)
    if (!exists) {
      // Session doesn't exist, just update the status
      const agents = loadAgents()
      const index = agents.findIndex(a => a.id === id)
      if (index !== -1) {
        // Update session status in sessions array
        if (agents[index].sessions) {
          const sessionIdx = agents[index].sessions.findIndex(s => s.index === sessionIndex)
          if (sessionIdx >= 0) {
            agents[index].sessions[sessionIdx].status = 'offline'
            agents[index].sessions[sessionIdx].lastActive = new Date().toISOString()
          }
        }
        // Check if any sessions are still online
        const hasOnlineSession = agents[index].sessions?.some(s => s.status === 'online') ?? false
        agents[index].status = hasOnlineSession ? 'active' : 'offline'
        agents[index].lastActive = new Date().toISOString()
        saveAgents(agents)
      }

      return NextResponse.json({
        success: true,
        agentId: id,
        sessionName,
        sessionIndex,
        hibernated: true,
        message: 'Session was already terminated, agent status updated'
      })
    }

    // Try to gracefully stop Claude Code first
    try {
      // Send Ctrl+C to interrupt any running command
      await execAsync(`tmux send-keys -t "${sessionName}" C-c`)
      await new Promise(resolve => setTimeout(resolve, 500))

      // Send 'exit' to close Claude Code gracefully
      await execAsync(`tmux send-keys -t "${sessionName}" "exit" Enter`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (e) {
      // Ignore errors in graceful shutdown, we'll force kill anyway
      console.log(`[Hibernate] Graceful shutdown attempt failed for ${sessionName}, will force kill`)
    }

    // Kill the tmux session
    try {
      await execAsync(`tmux kill-session -t "${sessionName}"`)
    } catch (e) {
      // Session might have already closed from the exit command
      console.log(`[Hibernate] Session ${sessionName} may have already closed`)
    }

    // Remove from session persistence
    unpersistSession(sessionName)

    // Update agent status in registry
    const agents = loadAgents()
    const index = agents.findIndex(a => a.id === id)
    if (index !== -1) {
      // Update session status in sessions array
      if (agents[index].sessions) {
        const sessionIdx = agents[index].sessions.findIndex(s => s.index === sessionIndex)
        if (sessionIdx >= 0) {
          agents[index].sessions[sessionIdx].status = 'offline'
          agents[index].sessions[sessionIdx].lastActive = new Date().toISOString()
        }
      }
      // Check if any sessions are still online
      const hasOnlineSession = agents[index].sessions?.some(s => s.status === 'online') ?? false
      agents[index].status = hasOnlineSession ? 'active' : 'offline'
      agents[index].lastActive = new Date().toISOString()
      saveAgents(agents)
    }

    console.log(`[Hibernate] Agent ${agentName} (${id}) session ${sessionIndex} hibernated successfully`)

    return NextResponse.json({
      success: true,
      agentId: id,
      name: agentName,
      sessionName,
      sessionIndex,
      hibernated: true,
      message: `Agent "${agentName}" session ${sessionIndex} has been hibernated. Use wake to restart.`
    })

  } catch (error) {
    console.error('[Hibernate] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to hibernate agent' },
      { status: 500 }
    )
  }
}

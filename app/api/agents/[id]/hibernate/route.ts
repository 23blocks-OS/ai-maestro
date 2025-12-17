import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getAgent, updateAgent, loadAgents, saveAgents } from '@/lib/agent-registry'
import { unpersistSession } from '@/lib/session-persistence'

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
 * 3. Updating agent status to 'offline' and session status to 'stopped'
 *
 * The agent's configuration (working directory, etc.) is preserved so it can be woken up later.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get the agent
    const agent = getAgent(id)
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    const sessionName = agent.tools.session?.tmuxSessionName
    if (!sessionName) {
      return NextResponse.json(
        { error: 'Agent has no linked session to hibernate' },
        { status: 400 }
      )
    }

    // Check if session exists
    const exists = await tmuxSessionExists(sessionName)
    if (!exists) {
      // Session doesn't exist, just update the status
      const agents = loadAgents()
      const index = agents.findIndex(a => a.id === id)
      if (index !== -1) {
        if (agents[index].tools.session) {
          agents[index].tools.session.status = 'stopped'
        }
        agents[index].status = 'offline'
        agents[index].lastActive = new Date().toISOString()
        saveAgents(agents)
      }

      return NextResponse.json({
        success: true,
        agentId: id,
        sessionName,
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
      if (agents[index].tools.session) {
        agents[index].tools.session.status = 'stopped'
        agents[index].tools.session.lastActive = new Date().toISOString()
      }
      agents[index].status = 'offline'
      agents[index].lastActive = new Date().toISOString()
      saveAgents(agents)
    }

    console.log(`[Hibernate] Agent ${agent.alias} (${id}) hibernated successfully`)

    return NextResponse.json({
      success: true,
      agentId: id,
      alias: agent.alias,
      sessionName,
      hibernated: true,
      message: `Agent "${agent.alias}" has been hibernated. Use wake to restart.`
    })

  } catch (error) {
    console.error('[Hibernate] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to hibernate agent' },
      { status: 500 }
    )
  }
}

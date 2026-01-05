import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getAgent, loadAgents, saveAgents } from '@/lib/agent-registry'
import { persistSession } from '@/lib/session-persistence'
import { computeSessionName, AgentSession } from '@/types/agent'

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
 * POST /api/agents/[id]/wake
 *
 * Wake a hibernated agent by:
 * 1. Creating a new tmux session with the stored working directory
 * 2. Starting Claude Code (or configured program) in the session
 * 3. Updating agent status to 'active' and session status to 'online'
 *
 * Optional body parameters:
 * - startProgram: boolean - Whether to start Claude Code automatically (default: true)
 * - sessionIndex: number - Which session to wake (default: 0)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Parse optional body
    let startProgram = true
    let sessionIndex = 0
    try {
      const body = await request.json()
      if (body.startProgram === false) {
        startProgram = false
      }
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

    // Get working directory (agent-level, or from preferences)
    const workingDirectory = agent.workingDirectory ||
                            agent.preferences?.defaultWorkingDirectory ||
                            process.cwd()

    // Compute the tmux session name from agent name and index
    const sessionName = computeSessionName(agentName, sessionIndex)

    // Check if session already exists
    const exists = await tmuxSessionExists(sessionName)
    if (exists) {
      // Session already running, just update status
      const agents = loadAgents()
      const index = agents.findIndex(a => a.id === id)
      if (index !== -1) {
        // Update or add session in sessions array
        if (!agents[index].sessions) {
          agents[index].sessions = []
        }
        const sessionIdx = agents[index].sessions.findIndex(s => s.index === sessionIndex)
        if (sessionIdx >= 0) {
          agents[index].sessions[sessionIdx].status = 'online'
          agents[index].sessions[sessionIdx].lastActive = new Date().toISOString()
        } else {
          agents[index].sessions.push({
            index: sessionIndex,
            status: 'online',
            workingDirectory,
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
          })
        }
        agents[index].status = 'active'
        agents[index].lastActive = new Date().toISOString()
        saveAgents(agents)
      }

      return NextResponse.json({
        success: true,
        agentId: id,
        name: agentName,
        sessionName,
        sessionIndex,
        woken: true,
        alreadyRunning: true,
        message: `Agent "${agentName}" session ${sessionIndex} was already running`
      })
    }

    // Create new tmux session
    try {
      await execAsync(`tmux new-session -d -s "${sessionName}" -c "${workingDirectory}"`)
    } catch (error) {
      console.error(`[Wake] Failed to create tmux session:`, error)
      return NextResponse.json(
        { error: 'Failed to create tmux session' },
        { status: 500 }
      )
    }

    // Persist session metadata
    persistSession({
      id: sessionName,
      name: sessionName,
      workingDirectory,
      createdAt: new Date().toISOString(),
      agentId: id
    })

    // Start the AI program if requested
    if (startProgram) {
      // Determine which program to start based on agent.program
      const program = agent.program?.toLowerCase() || 'claude code'

      let startCommand = ''
      if (program.includes('claude') || program.includes('claude code')) {
        startCommand = 'claude'
      } else if (program.includes('aider')) {
        startCommand = 'aider'
      } else if (program.includes('cursor')) {
        startCommand = 'cursor'
      } else {
        // Default to claude for unknown programs
        startCommand = 'claude'
      }

      // Small delay to let the session initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Send the command to start the program
      try {
        await execAsync(`tmux send-keys -t "${sessionName}" "${startCommand}" Enter`)
      } catch (error) {
        console.error(`[Wake] Failed to start program:`, error)
        // Don't fail the whole operation, session is still created
      }
    }

    // Update agent status in registry
    const agents = loadAgents()
    const index = agents.findIndex(a => a.id === id)
    if (index !== -1) {
      // Update or add session in sessions array
      if (!agents[index].sessions) {
        agents[index].sessions = []
      }
      const sessionIdx = agents[index].sessions.findIndex(s => s.index === sessionIndex)
      const sessionData: AgentSession = {
        index: sessionIndex,
        status: 'online',
        workingDirectory,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
      }
      if (sessionIdx >= 0) {
        agents[index].sessions[sessionIdx] = sessionData
      } else {
        agents[index].sessions.push(sessionData)
      }
      agents[index].status = 'active'
      agents[index].lastActive = new Date().toISOString()
      saveAgents(agents)
    }

    console.log(`[Wake] Agent ${agentName} (${id}) session ${sessionIndex} woken up successfully`)

    return NextResponse.json({
      success: true,
      agentId: id,
      name: agentName,
      sessionName,
      sessionIndex,
      workingDirectory,
      woken: true,
      programStarted: startProgram,
      message: `Agent "${agentName}" session ${sessionIndex} has been woken up and is ready to use.`
    })

  } catch (error) {
    console.error('[Wake] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to wake agent' },
      { status: 500 }
    )
  }
}

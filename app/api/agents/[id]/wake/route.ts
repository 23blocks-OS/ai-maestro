import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getAgent, loadAgents, saveAgents } from '@/lib/agent-registry'
import { persistSession } from '@/lib/session-persistence'

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
 * 3. Updating agent status to 'active' and session status to 'running'
 *
 * Optional body parameters:
 * - startProgram: boolean - Whether to start Claude Code automatically (default: true)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Parse optional body
    let startProgram = true
    try {
      const body = await request.json()
      if (body.startProgram === false) {
        startProgram = false
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

    // Get session configuration
    const sessionConfig = agent.tools.session
    if (!sessionConfig) {
      return NextResponse.json(
        { error: 'Agent has no session configuration. Create a session first.' },
        { status: 400 }
      )
    }

    const sessionName = sessionConfig.tmuxSessionName
    const workingDirectory = sessionConfig.workingDirectory ||
                            agent.preferences?.defaultWorkingDirectory ||
                            process.cwd()

    // Check if session already exists
    const exists = await tmuxSessionExists(sessionName)
    if (exists) {
      // Session already running, just update status
      const agents = loadAgents()
      const index = agents.findIndex(a => a.id === id)
      if (index !== -1) {
        if (agents[index].tools.session) {
          agents[index].tools.session.status = 'running'
        }
        agents[index].status = 'active'
        agents[index].lastActive = new Date().toISOString()
        saveAgents(agents)
      }

      return NextResponse.json({
        success: true,
        agentId: id,
        alias: agent.alias,
        sessionName,
        woken: true,
        alreadyRunning: true,
        message: `Agent "${agent.alias}" session was already running`
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
      if (agents[index].tools.session) {
        agents[index].tools.session.status = 'running'
        agents[index].tools.session.lastActive = new Date().toISOString()
      }
      agents[index].status = 'active'
      agents[index].lastActive = new Date().toISOString()
      saveAgents(agents)
    }

    console.log(`[Wake] Agent ${agent.alias} (${id}) woken up successfully`)

    return NextResponse.json({
      success: true,
      agentId: id,
      alias: agent.alias,
      sessionName,
      workingDirectory,
      woken: true,
      programStarted: startProgram,
      message: `Agent "${agent.alias}" has been woken up and is ready to use.`
    })

  } catch (error) {
    console.error('[Wake] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to wake agent' },
      { status: 500 }
    )
  }
}

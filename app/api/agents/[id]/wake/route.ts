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
 * - program: string - Override the program to start (claude, codex, aider, cursor)
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
    let programOverride: string | undefined
    try {
      const body = await request.json()
      console.log(`[Wake] Received body:`, JSON.stringify(body))
      if (body.startProgram === false) {
        startProgram = false
      }
      if (typeof body.sessionIndex === 'number') {
        sessionIndex = body.sessionIndex
      }
      if (typeof body.program === 'string') {
        programOverride = body.program.toLowerCase()
        console.log(`[Wake] Program override set to: ${programOverride}`)
      }
    } catch (e) {
      console.log(`[Wake] No body or invalid JSON, using defaults. Error:`, e)
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
      // Determine which program to start - use override if provided, else use agent.program
      const program = programOverride || agent.program?.toLowerCase() || 'claude code'
      console.log(`[Wake] Final program selection: "${program}" (override: ${programOverride}, agent.program: ${agent.program})`)

      // Check if user wants terminal only (no AI program)
      if (program === 'none' || program === 'terminal') {
        // Skip starting any program - just leave the shell
        console.log(`[Wake] Terminal only mode - no AI program started`)
      } else {
        let startCommand = ''
        if (program.includes('claude') || program.includes('claude code')) {
          startCommand = 'claude'
        } else if (program.includes('codex')) {
          startCommand = 'codex'
        } else if (program.includes('aider')) {
          startCommand = 'aider'
        } else if (program.includes('cursor')) {
          startCommand = 'cursor'
        } else if (program.includes('gemini')) {
          startCommand = 'gemini'
        } else if (program.includes('opencode')) {
          startCommand = 'opencode'
        } else {
          // Default to claude for unknown programs
          startCommand = 'claude'
        }

        // Per-program resume patterns to strip on first launch
        const RESUME_PATTERNS: Record<string, RegExp[]> = {
          'claude':   [/\s*--continue\b/, /\s*-c\b(?!\s*\S)/, /\s*--resume\b(\s+\S+)?/, /\s*-r\b(\s+\S+)?/],
          'codex':    [/\s*resume\s+--last\b/, /\s*resume\b(\s+\S+)?/],
          'gemini':   [/\s*--resume\b(\s+\S+)?/],
          'aider':    [/\s*--restore-chat-history\b/],
          'opencode': [/\s*--continue\b/, /\s*-c\b(?!\s*\S)/, /\s*--session\b(\s+\S+)?/, /\s*-s\b(\s+\S+)?/],
          'cursor':   [/\s*--resume\b(\s+\S+)?/, /\s*resume\b/],
        }

        function stripResumeFlags(argsStr: string, program: string): string {
          const patterns = RESUME_PATTERNS[program] || []
          let result = argsStr
          for (const pattern of patterns) {
            result = result.replace(pattern, '')
          }
          return result.trim()
        }

        // Build the full command with programArgs
        let fullCommand = startCommand
        if (agent.programArgs) {
          let args = agent.programArgs
          // Strip resume flags on first launch (no session to resume)
          const isFirstLaunch = !agent.launchCount || agent.launchCount === 0
          if (isFirstLaunch) {
            const programKey = Object.keys(RESUME_PATTERNS).find(k => startCommand.includes(k)) || ''
            if (programKey) {
              args = stripResumeFlags(args, programKey)
              console.log(`[Wake] First launch: stripped resume flags. Original: "${agent.programArgs}", Filtered: "${args}"`)
            }
          }
          if (args.trim()) {
            fullCommand = `${startCommand} ${args.trim()}`
          }
        }

        // Small delay to let the session initialize
        await new Promise(resolve => setTimeout(resolve, 300))

        // Send the command to start the program
        try {
          await execAsync(`tmux send-keys -t "${sessionName}" "${fullCommand}" Enter`)
        } catch (error) {
          console.error(`[Wake] Failed to start program:`, error)
          // Don't fail the whole operation, session is still created
        }
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
      agents[index].launchCount = (agents[index].launchCount || 0) + 1
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

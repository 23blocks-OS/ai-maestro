import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { unpersistSession } from '@/lib/session-persistence'
import { deleteAgentBySession, getAgentBySession } from '@/lib/agent-registry'

const execAsync = promisify(exec)

export const dynamic = 'force-dynamic'

/**
 * @deprecated Use /api/agents/[id]/session?kill=true&deleteAgent=true instead.
 * This endpoint uses tmux session names directly, while the agent endpoint
 * uses agent IDs for proper multi-host support.
 */
function logDeprecation() {
  console.warn('[DEPRECATED] DELETE /api/sessions/[id] - Use DELETE /api/agents/[id]/session?kill=true&deleteAgent=true instead')
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  logDeprecation()
  try {
    const { id: sessionName } = await params

    // Look up the agent associated with this session
    const agent = getAgentBySession(sessionName)
    const isCloudAgent = agent?.deployment?.type === 'cloud'

    if (isCloudAgent) {
      // Delete the agent (this will clean up messages, data directories, etc.)
      deleteAgentBySession(sessionName)

      return NextResponse.json({ success: true, name: sessionName, type: 'cloud' })
    }

    // Handle local tmux session
    // Check if session exists
    const { stdout: existingCheck } = await execAsync(
      `tmux has-session -t "${sessionName}" 2>&1 || echo "not_found"`
    )

    if (existingCheck.includes('not_found')) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Kill the tmux session
    await execAsync(`tmux kill-session -t "${sessionName}"`)

    // Remove from persistence
    unpersistSession(sessionName)

    // Also delete from registry (if agent exists there)
    deleteAgentBySession(sessionName)

    return NextResponse.json({ success: true, name: sessionName })
  } catch (error) {
    console.error('Failed to delete session:', error)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { unpersistSession } from '@/lib/session-persistence'
import { deleteAgentBySession } from '@/lib/agent-registry'
import fs from 'fs'
import path from 'path'
import os from 'os'

const execAsync = promisify(exec)

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionName } = await params

    // Check if this is a cloud agent
    const agentFilePath = path.join(os.homedir(), '.aimaestro', 'agents', `${sessionName}.json`)
    const isCloudAgent = fs.existsSync(agentFilePath)

    if (isCloudAgent) {
      // Delete cloud agent configuration file
      fs.unlinkSync(agentFilePath)

      // Also delete from registry (if agent exists there)
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

    return NextResponse.json({ success: true, name: sessionName, type: 'local' })
  } catch (error) {
    console.error('Failed to delete session:', error)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}

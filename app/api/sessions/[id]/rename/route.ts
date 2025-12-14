import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { renameAgentSession } from '@/lib/agent-registry'

const execAsync = promisify(exec)

export const dynamic = 'force-dynamic'

/**
 * @deprecated Use PATCH /api/agents/[id] to update agent alias instead.
 * This endpoint uses tmux session names directly, while the agent endpoint
 * uses agent IDs for proper multi-host support.
 */
function logDeprecation() {
  console.warn('[DEPRECATED] PATCH /api/sessions/[id]/rename - Use PATCH /api/agents/[id] to update alias instead')
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  logDeprecation()
  try {
    const [{ newName }, { id: oldName }] = await Promise.all([
      request.json(),
      params
    ])

    if (!newName || typeof newName !== 'string') {
      return NextResponse.json({ error: 'New session name is required' }, { status: 400 })
    }

    // Validate session name (no spaces, special chars except dash/underscore)
    if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
      return NextResponse.json(
        { error: 'Session name can only contain letters, numbers, dashes, and underscores' },
        { status: 400 }
      )
    }

    // Check if this is a cloud agent
    const agentsDir = path.join(os.homedir(), '.aimaestro', 'agents')
    const oldAgentFilePath = path.join(agentsDir, `${oldName}.json`)
    const newAgentFilePath = path.join(agentsDir, `${newName}.json`)
    const isCloudAgent = fs.existsSync(oldAgentFilePath)

    if (isCloudAgent) {
      // Check if new name is already taken (cloud agent)
      if (fs.existsSync(newAgentFilePath)) {
        return NextResponse.json({ error: 'Agent name already exists' }, { status: 409 })
      }

      // Read, update, and save cloud agent configuration
      const agentConfig = JSON.parse(fs.readFileSync(oldAgentFilePath, 'utf8'))
      agentConfig.id = newName
      agentConfig.alias = newName
      agentConfig.tools.session.tmuxSessionName = newName

      // Save with new name and delete old file
      fs.writeFileSync(newAgentFilePath, JSON.stringify(agentConfig, null, 2), 'utf8')
      fs.unlinkSync(oldAgentFilePath)

      // Also update the registry (if agent exists there)
      renameAgentSession(oldName, newName)

      return NextResponse.json({ success: true, oldName, newName, type: 'cloud' })
    }

    // Handle local tmux session
    // Check if old session exists
    const { stdout: existingCheck } = await execAsync(
      `tmux has-session -t "${oldName}" 2>&1 || echo "not_found"`
    )

    if (existingCheck.includes('not_found')) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Check if new name is already taken
    const { stdout: newNameCheck } = await execAsync(
      `tmux has-session -t "${newName}" 2>&1 || echo "not_found"`
    )

    if (!newNameCheck.includes('not_found')) {
      return NextResponse.json({ error: 'Session name already exists' }, { status: 409 })
    }

    // Rename the session
    await execAsync(`tmux rename-session -t "${oldName}" "${newName}"`)

    // Also update the registry (if agent exists there)
    renameAgentSession(oldName, newName)

    return NextResponse.json({ success: true, oldName, newName, type: 'local' })
  } catch (error) {
    console.error('Failed to rename session:', error)
    return NextResponse.json({ error: 'Failed to rename session' }, { status: 500 })
  }
}

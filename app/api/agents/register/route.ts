import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getAgentBySession, createAgent, linkSession } from '@/lib/agent-registry'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Handle two registration formats:
    // 1. Full agent config with id and websocketUrl (from external sources)
    // 2. Simple sessionName + workingDirectory (from WorkTree)

    let agentId: string
    let agentConfig: any
    let registryAgent = null

    if (body.sessionName && !body.id) {
      // WorkTree format - create agent from session name
      const { sessionName, workingDirectory } = body

      if (!sessionName) {
        return NextResponse.json(
          { error: 'Missing required field: sessionName' },
          { status: 400 }
        )
      }

      // Use sessionName as agentId (normalize to valid format)
      agentId = sessionName.replace(/[^a-zA-Z0-9_-]/g, '-')

      // Create minimal agent config for individual file
      agentConfig = {
        id: agentId,
        sessionName,
        workingDirectory: workingDirectory || process.cwd(),
        createdAt: Date.now(),
        type: 'local'
      }

      // Also create/update registry entry
      // Check if agent already exists in registry by session name
      const existingAgent = getAgentBySession(sessionName)
      if (existingAgent) {
        // Already in registry, just update session link
        linkSession(existingAgent.id, sessionName, workingDirectory || process.cwd())
        registryAgent = existingAgent
      } else {
        // Create new registry entry with minimal info
        // Extract display name from session name (last part after dashes)
        const parts = sessionName.split('-')
        const shortName = parts[parts.length - 1] || sessionName
        // Normalize tags to lowercase for case-insensitive handling
        const tags = parts.slice(0, -1).map((t: string) => t.toLowerCase())

        try {
          // Use full sessionName as the agent name (identity)
          registryAgent = createAgent({
            name: sessionName,
            label: shortName !== sessionName ? shortName : undefined,
            program: 'claude-code',
            model: 'claude-sonnet-4-5',
            taskDescription: `Agent for ${sessionName}`,
            tags,
            owner: os.userInfo().username,
            createSession: true,
            workingDirectory: workingDirectory || process.cwd()
          })
        } catch (createError) {
          console.warn(`[Register] Could not create registry entry for ${sessionName}:`, createError)
        }
      }
    } else {
      // Full agent config format (cloud agents)
      if (!body.id || !body.deployment?.cloud?.websocketUrl) {
        return NextResponse.json(
          { error: 'Missing required fields: id and websocketUrl' },
          { status: 400 }
        )
      }

      agentId = body.id
      agentConfig = body
    }

    // Ensure agents directory exists
    const agentsDir = path.join(os.homedir(), '.aimaestro', 'agents')
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true })
    }

    // Save agent configuration to individual file
    const agentFilePath = path.join(agentsDir, `${agentId}.json`)
    fs.writeFileSync(agentFilePath, JSON.stringify(agentConfig, null, 2), 'utf8')

    return NextResponse.json({
      success: true,
      message: `Agent ${agentId} registered successfully`,
      agentId,
      agent: agentConfig,
      registryAgent: registryAgent ? { id: registryAgent.id, name: registryAgent.name || registryAgent.alias } : null
    })
  } catch (error) {
    console.error('Failed to register agent:', error)
    return NextResponse.json(
      {
        error: 'Failed to register agent',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

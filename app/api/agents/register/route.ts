import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Handle two registration formats:
    // 1. Full agent config with id and websocketUrl (from external sources)
    // 2. Simple sessionName + workingDirectory (from WorkTree)

    let agentId: string
    let agentConfig: any

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

      // Create minimal agent config
      agentConfig = {
        id: agentId,
        sessionName,
        workingDirectory: workingDirectory || process.cwd(),
        createdAt: Date.now(),
        type: 'local'
      }
    } else {
      // Full agent config format
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

    // Save agent configuration
    const agentFilePath = path.join(agentsDir, `${agentId}.json`)
    fs.writeFileSync(agentFilePath, JSON.stringify(agentConfig, null, 2), 'utf8')

    return NextResponse.json({
      success: true,
      message: `Agent ${agentId} registered successfully`,
      agentId,
      agent: agentConfig
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

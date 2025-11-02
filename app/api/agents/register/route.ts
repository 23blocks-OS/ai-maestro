import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const agentConfig = await request.json()

    // Validate required fields
    if (!agentConfig.id || !agentConfig.deployment?.cloud?.websocketUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: id and websocketUrl' },
        { status: 400 }
      )
    }

    // Ensure agents directory exists
    const agentsDir = path.join(os.homedir(), '.aimaestro', 'agents')
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true })
    }

    // Save agent configuration
    const agentFilePath = path.join(agentsDir, `${agentConfig.id}.json`)
    fs.writeFileSync(agentFilePath, JSON.stringify(agentConfig, null, 2), 'utf8')

    return NextResponse.json({
      success: true,
      message: `Agent ${agentConfig.id} registered successfully`,
      agentId: agentConfig.id
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

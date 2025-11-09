import { NextResponse } from 'next/server'
import { getAgent } from '@/lib/agent-registry'
import { packAgent } from '@/lib/agent-pack'
import fs from 'fs'

/**
 * POST /api/agents/[id]/pack
 * Pack an agent for export, cloning, or distribution
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { includeWorkspace = false, includeMessages = true, includeSkills = true, outputPath } = body

    // Get agent
    const agent = getAgent(id)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Pack the agent
    const packResult = await packAgent({
      agentId: id,
      includeWorkspace,
      includeMessages,
      includeSkills,
      outputPath,
    })

    return NextResponse.json({
      success: true,
      packFile: packResult.packFile,
      size: packResult.size,
      manifest: packResult.manifest,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to pack agent'
    console.error('Failed to pack agent:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/agents/[id]/pack
 * Download packed agent as tarball
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const packFile = searchParams.get('file')

    if (!packFile) {
      return NextResponse.json({ error: 'Pack file path required' }, { status: 400 })
    }

    // Verify file exists and is in temp directory
    if (!fs.existsSync(packFile) || !packFile.includes('/tmp/')) {
      return NextResponse.json({ error: 'Invalid pack file' }, { status: 400 })
    }

    const fileBuffer = fs.readFileSync(packFile)
    const filename = packFile.split('/').pop() || 'agent-pack.tar.gz'

    // Return as downloadable file
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to download pack'
    console.error('Failed to download pack:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

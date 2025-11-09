import { NextResponse } from 'next/server'
import { unpackAgent, inspectPack } from '@/lib/agent-pack'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * POST /api/agents/unpack
 * Unpack and restore an agent from a pack file
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const newAlias = formData.get('newAlias') as string | null
    const restoreToId = formData.get('restoreToId') === 'true'
    const targetDirectory = formData.get('targetDirectory') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Pack file required' }, { status: 400 })
    }

    // Save uploaded file to temp directory
    const tempFile = path.join(os.tmpdir(), `upload-${Date.now()}-${file.name}`)
    const bytes = await file.arrayBuffer()
    fs.writeFileSync(tempFile, Buffer.from(bytes))

    try {
      // Unpack the agent
      const agent = await unpackAgent({
        packFile: tempFile,
        newAlias: newAlias || undefined,
        restoreToId,
        targetDirectory: targetDirectory || undefined,
      })

      // Cleanup temp file
      fs.unlinkSync(tempFile)

      return NextResponse.json({
        success: true,
        agent: {
          id: agent.id,
          alias: agent.alias,
          displayName: agent.displayName,
        },
      })
    } catch (error) {
      // Cleanup temp file on error
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile)
      }
      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to unpack agent'
    console.error('Failed to unpack agent:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/agents/unpack?inspect=<file>
 * Inspect a pack file without unpacking
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const inspectFile = searchParams.get('inspect')

    if (!inspectFile) {
      return NextResponse.json({ error: 'Pack file path required for inspection' }, { status: 400 })
    }

    // Verify file exists and is in temp directory
    if (!fs.existsSync(inspectFile) || !inspectFile.includes('/tmp/')) {
      return NextResponse.json({ error: 'Invalid pack file' }, { status: 400 })
    }

    const manifest = await inspectPack(inspectFile)

    return NextResponse.json({ manifest })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to inspect pack'
    console.error('Failed to inspect pack:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getAgent, getAgentByAlias, loadAgents, saveAgents } from '@/lib/agent-registry'
import fs from 'fs'
import path from 'path'
import os from 'os'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const AGENTS_DIR = path.join(AIMAESTRO_DIR, 'agents')
const MESSAGES_DIR = path.join(AIMAESTRO_DIR, 'messages')

interface TransferRequest {
  targetHostId: string
  targetHostUrl: string
  mode: 'move' | 'clone'
  newAlias?: string
  cloneRepositories?: boolean
}

/**
 * POST /api/agents/[id]/transfer
 * Transfer an agent to another AI Maestro instance
 *
 * Body:
 * - targetHostId: ID of the target host
 * - targetHostUrl: URL of the target AI Maestro instance
 * - mode: 'move' (delete source) or 'clone' (keep source)
 * - newAlias: Optional new alias for the agent on target
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Find agent by ID or alias
    let agent = getAgent(params.id)
    if (!agent) {
      agent = getAgentByAlias(params.id)
    }

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const body: TransferRequest = await request.json()
    const { targetHostUrl, mode, newAlias, cloneRepositories } = body

    if (!targetHostUrl) {
      return NextResponse.json({ error: 'Target host URL required' }, { status: 400 })
    }

    // Validate target URL
    let normalizedUrl = targetHostUrl.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `http://${normalizedUrl}`
    }
    // Remove trailing slash
    normalizedUrl = normalizedUrl.replace(/\/+$/, '')

    // Step 1: Export the agent
    // Instead of calling our own API, we'll call the export function directly
    const exportResponse = await fetch(`http://localhost:23000/api/agents/${agent.id}/export`)

    if (!exportResponse.ok) {
      const errorText = await exportResponse.text()
      return NextResponse.json({
        error: `Failed to export agent: ${errorText}`
      }, { status: 500 })
    }

    const exportBuffer = Buffer.from(await exportResponse.arrayBuffer())

    // Step 2: Send to target host's import API using native FormData with Blob
    const formData = new FormData()

    // Create a Blob from the buffer
    const blob = new Blob([exportBuffer], { type: 'application/zip' })
    formData.append('file', blob, `${agent.alias || agent.id}.zip`)

    // Add import options
    const importOptions: Record<string, unknown> = {}
    if (newAlias) {
      importOptions.newAlias = newAlias
    }
    if (cloneRepositories) {
      importOptions.cloneRepositories = true
    }
    formData.append('options', JSON.stringify(importOptions))

    // Send to target host
    const importResponse = await fetch(`${normalizedUrl}/api/agents/import`, {
      method: 'POST',
      body: formData
    })

    if (!importResponse.ok) {
      const errorText = await importResponse.text()
      let errorMessage = 'Failed to import on target host'
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error || errorMessage
      } catch {
        errorMessage = errorText || errorMessage
      }
      return NextResponse.json({ error: errorMessage }, { status: 500 })
    }

    const importResult = await importResponse.json()

    // Step 3: If move mode, delete the local agent
    if (mode === 'move') {
      try {
        // Delete agent directory
        const agentDir = path.join(AGENTS_DIR, agent.id)
        if (fs.existsSync(agentDir)) {
          fs.rmSync(agentDir, { recursive: true })
        }

        // Delete messages
        const sessionName = agent.tools.session?.tmuxSessionName || agent.alias
        if (sessionName) {
          const inboxDir = path.join(MESSAGES_DIR, 'inbox', sessionName)
          const sentDir = path.join(MESSAGES_DIR, 'sent', sessionName)
          const archivedDir = path.join(MESSAGES_DIR, 'archived', sessionName)

          if (fs.existsSync(inboxDir)) fs.rmSync(inboxDir, { recursive: true })
          if (fs.existsSync(sentDir)) fs.rmSync(sentDir, { recursive: true })
          if (fs.existsSync(archivedDir)) fs.rmSync(archivedDir, { recursive: true })
        }

        // Remove from registry
        const agents = loadAgents()
        const filteredAgents = agents.filter(a => a.id !== agent.id)
        saveAgents(filteredAgents)
      } catch (deleteError) {
        console.error('Failed to delete source agent after move:', deleteError)
        // Don't fail the transfer, just warn
        return NextResponse.json({
          success: true,
          mode,
          newAgentId: importResult.agent?.id,
          newAlias: importResult.agent?.alias,
          targetHost: normalizedUrl,
          warning: 'Agent transferred but failed to delete source. Manual cleanup may be needed.',
          importResult
        })
      }
    }

    return NextResponse.json({
      success: true,
      mode,
      newAgentId: importResult.agent?.id,
      newAlias: importResult.agent?.alias,
      targetHost: normalizedUrl,
      importResult
    })

  } catch (error) {
    console.error('Transfer error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Transfer failed'
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getAgent, getAgentByAlias, loadAgents, saveAgents } from '@/lib/agent-registry'
import { getSelfHost, getHosts } from '@/lib/hosts-config'
import { isValidUuid } from '@/lib/validation'
import fs from 'fs'
import path from 'path'
import os from 'os'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const AGENTS_DIR = path.join(AIMAESTRO_DIR, 'agents')
const MESSAGES_DIR = path.join(AIMAESTRO_DIR, 'messages')

// Named HostTransferRequest to avoid collision with governance TransferRequest in transfer-registry.ts
interface HostTransferRequest {
  targetHostId?: string // CC-009: Optional — reserved for Phase 2 hostname validation against hosts.json
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // CC-003 fix: Resolve agent by UUID or alias in a single pass, no duplicate lookups
    let agent = isValidUuid(id) ? getAgent(id) : null
    if (!agent) {
      agent = getAgentByAlias(id)
    }
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Parse request body with error handling for malformed JSON
    let body: HostTransferRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }

    const { targetHostUrl, mode, newAlias, cloneRepositories } = body

    // CC-014 fix: Runtime validation for mode — TypeScript types are not enforced at runtime
    if (mode !== 'move' && mode !== 'clone') {
      return NextResponse.json({ error: 'mode must be "move" or "clone"' }, { status: 400 })
    }

    // Validate targetHostUrl is a string type
    if (typeof targetHostUrl !== 'string') {
      return NextResponse.json({ error: 'targetHostUrl must be a string' }, { status: 400 })
    }

    if (!targetHostUrl) {
      return NextResponse.json({ error: 'Target host URL required' }, { status: 400 })
    }

    // Normalize the target URL
    let normalizedUrl = targetHostUrl.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `http://${normalizedUrl}`
    }
    // Remove trailing slash
    normalizedUrl = normalizedUrl.replace(/\/+$/, '')

    // SSRF protection: validate the normalized URL is a proper HTTP/HTTPS URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(normalizedUrl)
    } catch {
      return NextResponse.json({ error: 'Invalid target URL' }, { status: 400 })
    }
    // Only allow http/https protocols to prevent SSRF via file://, ftp://, etc.
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Only HTTP/HTTPS URLs are supported' }, { status: 400 })
    }

    // CC-008 fix: Validate hostname against registered hosts in hosts.json to prevent SSRF.
    // Block requests to hostnames that are not registered in the mesh network.
    const registeredHosts = getHosts()
    const targetHostname = parsedUrl.hostname.toLowerCase()
    const isRegisteredHost = registeredHosts.some(h => {
      try {
        const hostUrl = new URL(h.url)
        return hostUrl.hostname.toLowerCase() === targetHostname
      } catch {
        return false
      }
    })
    if (!isRegisteredHost) {
      return NextResponse.json(
        { error: 'Target host is not registered in hosts.json. Register the host before transferring agents.' },
        { status: 400 }
      )
    }

    // CC-016 fix: Redact agent ID from log to prevent info leakage in multi-user scenarios
    console.log(`[agent-transfer] Transfer initiated to ${parsedUrl.hostname}`)

    // Step 1: Export the agent
    // Call our own export API - use self host URL, never localhost
    const selfHost = getSelfHost()
    const exportResponse = await fetch(`${selfHost.url}/api/agents/${agent.id}/export`)

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

        // Delete messages - use agent name as session name
        const sessionName = agent.name || agent.alias
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

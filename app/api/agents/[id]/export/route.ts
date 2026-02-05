import { NextResponse } from 'next/server'
import { getAgent, getAgentByAlias, getAgentByName, getAgentSkills, DEFAULT_AI_MAESTRO_SKILLS } from '@/lib/agent-registry'
import { getSkillById } from '@/lib/marketplace-skills'
import { hasKeyPair, getKeysDir, getRegistrationsDir, listRegisteredProviders } from '@/lib/amp-keys'
import archiver from 'archiver'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import type { AgentExportManifest, PortableRepository } from '@/types/portable'

// Read version from version.json
const VERSION_FILE = path.join(process.cwd(), 'version.json')
function getAIMaestroVersion(): string {
  try {
    const data = fs.readFileSync(VERSION_FILE, 'utf-8')
    const { version } = JSON.parse(data)
    return version || '0.15.0'
  } catch {
    return '0.15.0'
  }
}

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const AGENTS_DIR = path.join(AIMAESTRO_DIR, 'agents')
const MESSAGES_DIR = path.join(AIMAESTRO_DIR, 'messages')

/**
 * Count JSON files in a directory
 */
function countJsonFiles(dirPath: string): number {
  try {
    if (!fs.existsSync(dirPath)) return 0
    const files = fs.readdirSync(dirPath)
    return files.filter(f => f.endsWith('.json')).length
  } catch {
    return 0
  }
}

/**
 * Detect git repository info from a directory
 * Returns PortableRepository (without local paths for transfer)
 */
function detectGitRepo(dirPath: string): PortableRepository | null {
  try {
    // Check if it's a git repo
    const gitDir = path.join(dirPath, '.git')
    if (!fs.existsSync(gitDir)) {
      return null
    }

    // Get remote URL
    let remoteUrl = ''
    try {
      remoteUrl = execSync('git config --get remote.origin.url', {
        cwd: dirPath,
        encoding: 'utf-8',
        timeout: 5000
      }).trim()
    } catch {
      // No remote configured
    }

    if (!remoteUrl) {
      return null // Skip repos without remotes - can't clone on new host
    }

    // Get default branch
    let defaultBranch = 'main'
    try {
      // Try to get the default branch from remote
      const remoteBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo ""', {
        cwd: dirPath,
        encoding: 'utf-8',
        timeout: 5000,
        shell: '/bin/bash'
      }).trim()
      if (remoteBranch) {
        defaultBranch = remoteBranch.replace('refs/remotes/origin/', '')
      } else {
        // Fallback to current branch
        defaultBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: dirPath,
          encoding: 'utf-8',
          timeout: 5000
        }).trim()
      }
    } catch {
      // Use default
    }

    // Derive name from directory or remote URL
    const name = path.basename(dirPath) || path.basename(remoteUrl.replace(/\.git$/, ''))

    return {
      name,
      remoteUrl,
      defaultBranch,
      isPrimary: true,
      originalPath: dirPath // Reference only - user chooses new path on import
    }
  } catch (error) {
    console.error(`Error detecting git repo for ${dirPath}:`, error)
    return null
  }
}

/**
 * GET /api/agents/[id]/export
 * Export an agent as a downloadable ZIP file
 *
 * The ZIP contains:
 * - manifest.json: Export metadata
 * - registry.json: Agent's registry entry (sanitized)
 * - agent.db: CozoDB database (if exists)
 * - messages/inbox/*.json: Inbox messages
 * - messages/sent/*.json: Sent messages
 * - messages/archived/*.json: Archived messages
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Try to find agent by ID first, then by name, then by alias (deprecated)
    let agent = getAgent(params.id)
    if (!agent) {
      agent = getAgentByName(params.id)
    }
    if (!agent) {
      agent = getAgentByAlias(params.id)
    }

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Get the agent name (new field, fallback to deprecated alias)
    const agentName = agent.name || agent.alias
    if (!agentName) {
      return NextResponse.json({ error: 'Agent has no name configured' }, { status: 400 })
    }

    // Paths to agent data - messages use agent name as directory
    const agentDbDir = path.join(AGENTS_DIR, agent.id)
    const agentDbFile = path.join(agentDbDir, 'agent.db')
    const inboxDir = path.join(MESSAGES_DIR, 'inbox', agentName)
    const sentDir = path.join(MESSAGES_DIR, 'sent', agentName)
    const archivedDir = path.join(MESSAGES_DIR, 'archived', agentName)

    // Check what data exists
    const hasDatabase = fs.existsSync(agentDbFile)
    const hasInbox = fs.existsSync(inboxDir)
    const hasSent = fs.existsSync(sentDir)
    const hasArchived = fs.existsSync(archivedDir)
    const hasMessages = hasInbox || hasSent || hasArchived

    // Count messages
    const inboxCount = countJsonFiles(inboxDir)
    const sentCount = countJsonFiles(sentDir)
    const archivedCount = countJsonFiles(archivedDir)

    // Get skills configuration
    const skills = getAgentSkills(agent.id)
    const hasSkills = !!(skills && (
      skills.marketplace.length > 0 ||
      skills.custom.length > 0 ||
      (skills.aiMaestro.enabled && skills.aiMaestro.skills.length > 0)
    ))

    // Check for hooks
    const hasHooks = !!(agent.hooks && Object.keys(agent.hooks).length > 0)

    // Check for AMP keys and registrations
    const hasKeys = hasKeyPair(agent.id)
    const registeredProviders = listRegisteredProviders(agent.id)
    const hasRegistrations = registeredProviders.length > 0

    // Detect git repositories
    const repositories: PortableRepository[] = []

    // First, check working directory for git repo
    const workingDir = agent.workingDirectory || agent.preferences?.defaultWorkingDirectory
    if (workingDir && fs.existsSync(workingDir)) {
      const detectedRepo = detectGitRepo(workingDir)
      if (detectedRepo) {
        repositories.push(detectedRepo)
      }
    }

    // Also include any manually configured repos (convert to portable format)
    if (agent.tools.repositories) {
      for (const repo of agent.tools.repositories) {
        // Skip if we already detected this repo
        if (repositories.some(r => r.remoteUrl === repo.remoteUrl)) {
          continue
        }
        repositories.push({
          name: repo.name,
          remoteUrl: repo.remoteUrl,
          defaultBranch: repo.defaultBranch,
          isPrimary: repo.isPrimary,
          originalPath: repo.localPath
        })
      }
    }

    // Create manifest
    const manifest: AgentExportManifest = {
      version: '1.2.0', // Version bump for AMP identity support
      exportedAt: new Date().toISOString(),
      exportedFrom: {
        hostname: os.hostname(),
        platform: os.platform(),
        aiMaestroVersion: getAIMaestroVersion()
      },
      agent: {
        id: agent.id,
        name: agentName,
        label: agent.label,
        // Deprecated fields for backwards compatibility
        alias: agent.alias
      },
      contents: {
        hasRegistry: true,
        hasDatabase,
        hasMessages,
        messageStats: {
          inbox: inboxCount,
          sent: sentCount,
          archived: archivedCount
        },
        // Skills support (v1.1.0)
        hasSkills,
        skillStats: hasSkills ? {
          marketplace: skills?.marketplace.length || 0,
          aiMaestro: skills?.aiMaestro.enabled ? skills.aiMaestro.skills.length : 0,
          custom: skills?.custom.length || 0
        } : undefined,
        hasHooks,
        // AMP Identity support (v1.2.0)
        hasKeys,
        hasRegistrations,
        registrationProviders: hasRegistrations ? registeredProviders : undefined
      },
      // Include detected repositories for cloning on import
      repositories: repositories.length > 0 ? repositories : undefined
    }

    // Create a sanitized version of the agent for export
    // Remove sensitive/machine-specific data that shouldn't be exported
    const exportableAgent = {
      ...agent,
      // Use canonical name
      name: agentName,
      // Reset deployment to neutral state - will be set on import
      deployment: {
        type: 'local' as const
        // Remove local/cloud specific details
      },
      // Reset all sessions to offline - will be recreated on import
      sessions: (agent.sessions || []).map(s => ({
        ...s,
        status: 'offline' as const
      })),
      // Keep workingDirectory as a hint for the new machine
      workingDirectory: agent.workingDirectory,
      // Reset status
      status: 'offline' as const,
      // Keep metrics but note they're historical
      metrics: {
        ...agent.metrics,
        // Add export marker
      }
    }

    // Create ZIP archive in memory
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    })

    // Collect archive data
    const chunks: Buffer[] = []

    archive.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    // Add manifest
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

    // Add registry (agent metadata)
    archive.append(JSON.stringify(exportableAgent, null, 2), { name: 'registry.json' })

    // Add database if exists
    if (hasDatabase) {
      archive.file(agentDbFile, { name: 'agent.db' })
    }

    // Add messages
    if (hasInbox) {
      archive.directory(inboxDir, 'messages/inbox')
    }
    if (hasSent) {
      archive.directory(sentDir, 'messages/sent')
    }
    if (hasArchived) {
      archive.directory(archivedDir, 'messages/archived')
    }

    // Add skills (v1.1.0)
    if (hasSkills && skills) {
      // Add marketplace skills - copy the actual SKILL.md files
      for (const marketplaceSkill of skills.marketplace) {
        const skill = await getSkillById(marketplaceSkill.id, true)
        if (skill?.content) {
          const skillPath = `skills/marketplace/${marketplaceSkill.marketplace}/${marketplaceSkill.plugin}/${marketplaceSkill.name}/SKILL.md`
          archive.append(skill.content, { name: skillPath })
        }
      }

      // Add custom skills - copy from agent's folder
      for (const customSkill of skills.custom) {
        const customSkillDir = path.join(AGENTS_DIR, agent.id, customSkill.path)
        if (fs.existsSync(customSkillDir)) {
          archive.directory(customSkillDir, `skills/custom/${customSkill.name}`)
        }
      }
    }

    // Add hooks if present
    if (hasHooks && agent.hooks) {
      // Create hooks manifest
      archive.append(JSON.stringify(agent.hooks, null, 2), { name: 'hooks/hooks.json' })

      // Copy hook scripts if they exist relative to agent folder
      for (const [_event, scriptPath] of Object.entries(agent.hooks)) {
        if (scriptPath.startsWith('./')) {
          const fullPath = path.join(AGENTS_DIR, agent.id, scriptPath.slice(2))
          if (fs.existsSync(fullPath)) {
            archive.file(fullPath, { name: `hooks/${path.basename(scriptPath)}` })
          }
        }
      }
    }

    // Add AMP keys if present (v1.2.0)
    if (hasKeys) {
      const keysDir = getKeysDir(agent.id)
      if (fs.existsSync(keysDir)) {
        archive.directory(keysDir, 'keys')
      }
    }

    // Add external registrations if present (v1.2.0)
    if (hasRegistrations) {
      const registrationsDir = getRegistrationsDir(agent.id)
      if (fs.existsSync(registrationsDir)) {
        archive.directory(registrationsDir, 'registrations')
      }
    }

    // Set up promise to wait for archive completion BEFORE finalizing
    // (must be set up before finalize() or we may miss the 'end' event)
    const archiveComplete = new Promise<void>((resolve, reject) => {
      archive.on('end', resolve)
      archive.on('error', reject)
    })

    // Finalize the archive
    await archive.finalize()

    // Wait for all data to be collected
    await archiveComplete

    // Combine chunks into final buffer
    const zipBuffer = Buffer.concat(chunks)

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `${agentName}-export-${timestamp}.zip`

    // Return ZIP file as download
    return new Response(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length.toString(),
        'X-Agent-Id': agent.id,
        'X-Agent-Name': agentName,
        'X-Export-Version': '1.0.0'
      }
    })

  } catch (error) {
    console.error('Failed to export agent:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export agent' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents/[id]/export
 * Export agent transcript in specified format (JSON, Markdown, or Plain Text)
 *
 * Body:
 * - format: Export format - 'json', 'markdown', or 'plaintext' (required)
 * - sessionId: Specific session to export (optional, exports all if not provided)
 * - startDate: Filter by start date (ISO timestamp, optional)
 * - endDate: Filter by end date (ISO timestamp, optional)
 * - includeMetadata: Include agent metadata in export (default: false)
 *
 * Returns:
 * - jobId: Unique job identifier for tracking export status
 * - status: 'pending' | 'processing' | 'completed' | 'failed'
 * - format: Export format used
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Try to find agent by ID first, then by name, then by alias (deprecated)
    let agent = getAgent(params.id)
    if (!agent) {
      agent = getAgentByName(params.id)
    }
    if (!agent) {
      agent = getAgentByAlias(params.id)
    }

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const body = await request.json()

    // Validate required format parameter
    const format = body.format
    if (!format) {
      return NextResponse.json(
        { error: 'Missing required parameter: format' },
        { status: 400 }
      )
    }

    // Validate format value
    if (!['json', 'markdown', 'plaintext'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Must be: json, markdown, or plaintext' },
        { status: 400 }
      )
    }

    // Extract optional parameters
    const sessionId = body.sessionId
    const startDate = body.startDate
    const endDate = body.endDate
    const includeMetadata = body.includeMetadata === true

    // Validate date formats if provided
    if (startDate && isNaN(Date.parse(startDate))) {
      return NextResponse.json(
        { error: 'Invalid startDate format. Must be ISO 8601 timestamp' },
        { status: 400 }
      )
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      return NextResponse.json(
        { error: 'Invalid endDate format. Must be ISO 8601 timestamp' },
        { status: 400 }
      )
    }

    // Validate sessionId exists for this agent (session is identified by index)
    if (sessionId && !agent.sessions?.some(s => s.index === parseInt(sessionId))) {
      return NextResponse.json(
        { error: 'Session not found for this agent' },
        { status: 404 }
      )
    }

    console.log(
      `[Transcript Export] Agent: ${params.id}, Format: ${format}, Session: ${sessionId || 'all'}`
    )

    // Generate unique job ID
    const jobId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // TODO: Implement actual transcript export logic
    // This will use lib/transcript-export.ts in a future task
    // For now, return a pending job status as scaffolding
    const exportJob = {
      id: jobId,
      agentId: agent.id,
      agentName: agent.name || agent.alias,
      sessionId,
      format,
      status: 'pending',
      createdAt: new Date().toISOString(),
      progress: 0,
      filePath: null
    }

    // TODO: Store export job in database or file system
    // This will be implemented in lib/transcript-export.ts

    return NextResponse.json({
      success: true,
      job: exportJob,
      message: 'Transcript export job created successfully'
    })
  } catch (error) {
    console.error('Failed to create transcript export job:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create transcript export job' },
      { status: 500 }
    )
  }
}

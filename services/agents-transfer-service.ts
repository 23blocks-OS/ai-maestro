/**
 * Agents Transfer Service
 *
 * Business logic for agent export, import, and transfer operations.
 * Routes are thin wrappers that call these functions.
 */

import { getAgent, getAgentByAlias, getAgentByName, getAgentSkills, loadAgents, saveAgents } from '@/lib/agent-registry'
import { getSkillById } from '@/lib/marketplace-skills'
import { hasKeyPair, getKeysDir, getRegistrationsDir, listRegisteredProviders, generateKeyPair, saveKeyPair } from '@/lib/amp-keys'
import { getSelfHost } from '@/lib/hosts-config'
import archiver from 'archiver'
import yauzl from 'yauzl'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { execSync } from 'child_process'
import type { Agent, Repository } from '@/types/agent'
import type { AgentExportManifest, AgentImportOptions, AgentImportResult, PortableRepository, RepositoryImportResult } from '@/types/portable'

// ── Constants ───────────────────────────────────────────────────────────────

const VERSION_FILE = path.join(process.cwd(), 'version.json')
const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const AGENTS_DIR = path.join(AIMAESTRO_DIR, 'agents')
const MESSAGES_DIR = path.join(AIMAESTRO_DIR, 'messages')

// ── Types ───────────────────────────────────────────────────────────────────

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
}

export interface TransferRequest {
  targetHostId: string
  targetHostUrl: string
  mode: 'move' | 'clone'
  newAlias?: string
  cloneRepositories?: boolean
}

export interface TransferResult {
  success: boolean
  mode: string
  newAgentId?: string
  newAlias?: string
  targetHost: string
  warning?: string
  importResult?: AgentImportResult
}

export interface TranscriptExportRequest {
  format: string
  sessionId?: string
  startDate?: string
  endDate?: string
  includeMetadata?: boolean
}

export interface ExportZipResult {
  buffer: Buffer
  filename: string
  agentId: string
  agentName: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getAIMaestroVersion(): string {
  try {
    const data = fs.readFileSync(VERSION_FILE, 'utf-8')
    const { version } = JSON.parse(data)
    return version || '0.15.0'
  } catch {
    return '0.15.0'
  }
}

function countJsonFiles(dirPath: string): number {
  try {
    if (!fs.existsSync(dirPath)) return 0
    const files = fs.readdirSync(dirPath)
    return files.filter(f => f.endsWith('.json')).length
  } catch {
    return 0
  }
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function detectGitRepo(dirPath: string): PortableRepository | null {
  try {
    const gitDir = path.join(dirPath, '.git')
    if (!fs.existsSync(gitDir)) {
      return null
    }

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
      return null
    }

    let defaultBranch = 'main'
    try {
      const remoteBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo ""', {
        cwd: dirPath,
        encoding: 'utf-8',
        timeout: 5000,
        shell: '/bin/bash'
      }).trim()
      if (remoteBranch) {
        defaultBranch = remoteBranch.replace('refs/remotes/origin/', '')
      } else {
        defaultBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: dirPath,
          encoding: 'utf-8',
          timeout: 5000
        }).trim()
      }
    } catch {
      // Use default
    }

    const name = path.basename(dirPath) || path.basename(remoteUrl.replace(/\.git$/, ''))

    return {
      name,
      remoteUrl,
      defaultBranch,
      isPrimary: true,
      originalPath: dirPath
    }
  } catch (error) {
    console.error(`Error detecting git repo for ${dirPath}:`, error)
    return null
  }
}

function cloneRepository(
  repo: PortableRepository,
  targetPath: string
): RepositoryImportResult {
  try {
    if (fs.existsSync(targetPath)) {
      const gitDir = path.join(targetPath, '.git')
      if (fs.existsSync(gitDir)) {
        try {
          const existingRemote = execSync('git config --get remote.origin.url', {
            cwd: targetPath,
            encoding: 'utf-8',
            timeout: 5000
          }).trim()

          if (existingRemote === repo.remoteUrl) {
            return {
              name: repo.name,
              remoteUrl: repo.remoteUrl,
              status: 'exists',
              localPath: targetPath
            }
          }
        } catch {
          // Not a valid git repo or no remote
        }
      }
      return {
        name: repo.name,
        remoteUrl: repo.remoteUrl,
        status: 'failed',
        localPath: targetPath,
        error: `Directory ${targetPath} already exists`
      }
    }

    ensureDir(path.dirname(targetPath))

    const branch = repo.defaultBranch || 'main'
    execSync(`git clone --branch ${branch} "${repo.remoteUrl}" "${targetPath}"`, {
      encoding: 'utf-8',
      timeout: 300000,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    return {
      name: repo.name,
      remoteUrl: repo.remoteUrl,
      status: 'cloned',
      localPath: targetPath
    }
  } catch (error) {
    return {
      name: repo.name,
      remoteUrl: repo.remoteUrl,
      status: 'failed',
      localPath: targetPath,
      error: error instanceof Error ? error.message : 'Clone failed'
    }
  }
}

async function extractZip(zipBuffer: Buffer, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tempZipPath = path.join(os.tmpdir(), `temp-zip-${Date.now()}.zip`)
    fs.writeFileSync(tempZipPath, zipBuffer)

    yauzl.open(tempZipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        fs.unlinkSync(tempZipPath)
        return reject(err)
      }

      if (!zipfile) {
        fs.unlinkSync(tempZipPath)
        return reject(new Error('Failed to open ZIP file'))
      }

      zipfile.readEntry()

      zipfile.on('entry', (entry) => {
        const fullPath = path.join(destDir, entry.fileName)

        if (/\/$/.test(entry.fileName)) {
          ensureDir(fullPath)
          zipfile.readEntry()
          return
        }

        ensureDir(path.dirname(fullPath))

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) {
            return reject(err)
          }
          if (!readStream) {
            return reject(new Error('Failed to open read stream'))
          }

          const writeStream = fs.createWriteStream(fullPath)
          readStream.pipe(writeStream)

          writeStream.on('close', () => {
            zipfile.readEntry()
          })

          writeStream.on('error', reject)
        })
      })

      zipfile.on('end', () => {
        fs.unlinkSync(tempZipPath)
        resolve()
      })

      zipfile.on('error', (err) => {
        fs.unlinkSync(tempZipPath)
        reject(err)
      })
    })
  })
}

/**
 * Resolve an agent by ID, name, or alias (deprecated).
 */
function resolveAgent(idOrName: string): Agent | null {
  return getAgent(idOrName) || getAgentByName(idOrName) || getAgentByAlias(idOrName) || null
}

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Export an agent as a ZIP buffer.
 *
 * Returns the ZIP buffer, filename, and agent metadata for the route
 * to set response headers.
 */
export async function exportAgentZip(agentIdOrName: string): Promise<ServiceResult<ExportZipResult>> {
  const agent = resolveAgent(agentIdOrName)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  const agentName = agent.name || agent.alias
  if (!agentName) {
    return { error: 'Agent has no name configured', status: 400 }
  }

  // Paths to agent data
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

  const hasHooks = !!(agent.hooks && Object.keys(agent.hooks).length > 0)
  const hasKeys = hasKeyPair(agent.id)
  const registeredProviders = listRegisteredProviders(agent.id)
  const hasRegistrations = registeredProviders.length > 0

  // Detect git repositories
  const repositories: PortableRepository[] = []
  const workingDir = agent.workingDirectory || agent.preferences?.defaultWorkingDirectory
  if (workingDir && fs.existsSync(workingDir)) {
    const detectedRepo = detectGitRepo(workingDir)
    if (detectedRepo) {
      repositories.push(detectedRepo)
    }
  }
  if (agent.tools.repositories) {
    for (const repo of agent.tools.repositories) {
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
    version: '1.2.0',
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
      hasSkills,
      skillStats: hasSkills ? {
        marketplace: skills?.marketplace.length || 0,
        aiMaestro: skills?.aiMaestro.enabled ? skills.aiMaestro.skills.length : 0,
        custom: skills?.custom.length || 0
      } : undefined,
      hasHooks,
      hasKeys,
      hasRegistrations,
      registrationProviders: hasRegistrations ? registeredProviders : undefined
    },
    repositories: repositories.length > 0 ? repositories : undefined
  }

  // Create sanitized agent for export
  const exportableAgent = {
    ...agent,
    name: agentName,
    deployment: {
      type: 'local' as const
    },
    sessions: (agent.sessions || []).map(s => ({
      ...s,
      status: 'offline' as const
    })),
    workingDirectory: agent.workingDirectory,
    status: 'offline' as const,
    metrics: {
      ...agent.metrics,
    }
  }

  // Create ZIP archive
  const archive = archiver('zip', { zlib: { level: 9 } })
  const chunks: Buffer[] = []

  archive.on('data', (chunk: Buffer) => {
    chunks.push(chunk)
  })

  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })
  archive.append(JSON.stringify(exportableAgent, null, 2), { name: 'registry.json' })

  if (hasDatabase) {
    archive.file(agentDbFile, { name: 'agent.db' })
  }

  if (hasInbox) archive.directory(inboxDir, 'messages/inbox')
  if (hasSent) archive.directory(sentDir, 'messages/sent')
  if (hasArchived) archive.directory(archivedDir, 'messages/archived')

  // Add skills
  if (hasSkills && skills) {
    for (const marketplaceSkill of skills.marketplace) {
      const skill = await getSkillById(marketplaceSkill.id, true)
      if (skill?.content) {
        const skillPath = `skills/marketplace/${marketplaceSkill.marketplace}/${marketplaceSkill.plugin}/${marketplaceSkill.name}/SKILL.md`
        archive.append(skill.content, { name: skillPath })
      }
    }
    for (const customSkill of skills.custom) {
      const customSkillDir = path.join(AGENTS_DIR, agent.id, customSkill.path)
      if (fs.existsSync(customSkillDir)) {
        archive.directory(customSkillDir, `skills/custom/${customSkill.name}`)
      }
    }
  }

  // Add hooks
  if (hasHooks && agent.hooks) {
    archive.append(JSON.stringify(agent.hooks, null, 2), { name: 'hooks/hooks.json' })
    for (const [_event, scriptPath] of Object.entries(agent.hooks)) {
      if (scriptPath.startsWith('./')) {
        const fullPath = path.join(AGENTS_DIR, agent.id, scriptPath.slice(2))
        if (fs.existsSync(fullPath)) {
          archive.file(fullPath, { name: `hooks/${path.basename(scriptPath)}` })
        }
      }
    }
  }

  // Add AMP keys
  if (hasKeys) {
    const keysDir = getKeysDir(agent.id)
    if (fs.existsSync(keysDir)) {
      archive.directory(keysDir, 'keys')
    }
  }

  // Add registrations
  if (hasRegistrations) {
    const registrationsDir = getRegistrationsDir(agent.id)
    if (fs.existsSync(registrationsDir)) {
      archive.directory(registrationsDir, 'registrations')
    }
  }

  const archiveComplete = new Promise<void>((resolve, reject) => {
    archive.on('end', resolve)
    archive.on('error', reject)
  })

  await archive.finalize()
  await archiveComplete

  const zipBuffer = Buffer.concat(chunks)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `${agentName}-export-${timestamp}.zip`

  return {
    data: {
      buffer: zipBuffer,
      filename,
      agentId: agent.id,
      agentName
    },
    status: 200
  }
}

/**
 * Create a transcript export job.
 */
export function createTranscriptExportJob(
  agentIdOrName: string,
  body: TranscriptExportRequest
): ServiceResult<Record<string, unknown>> {
  const agent = resolveAgent(agentIdOrName)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  const { format, sessionId, startDate, endDate } = body

  if (!format) {
    return { error: 'Missing required parameter: format', status: 400 }
  }

  if (!['json', 'markdown', 'plaintext'].includes(format)) {
    return { error: 'Invalid format. Must be: json, markdown, or plaintext', status: 400 }
  }

  if (startDate && isNaN(Date.parse(startDate))) {
    return { error: 'Invalid startDate format. Must be ISO 8601 timestamp', status: 400 }
  }

  if (endDate && isNaN(Date.parse(endDate))) {
    return { error: 'Invalid endDate format. Must be ISO 8601 timestamp', status: 400 }
  }

  if (sessionId && !agent.sessions?.some(s => s.index === parseInt(sessionId))) {
    return { error: 'Session not found for this agent', status: 404 }
  }

  console.log(
    `[Transcript Export] Agent: ${agentIdOrName}, Format: ${format}, Session: ${sessionId || 'all'}`
  )

  const jobId = `export-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

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

  return {
    data: {
      success: true,
      job: exportJob,
      message: 'Transcript export job created successfully'
    },
    status: 200
  }
}

/**
 * Import an agent from a ZIP buffer.
 */
export async function importAgent(
  zipBuffer: Buffer,
  options: AgentImportOptions = {}
): Promise<ServiceResult<AgentImportResult>> {
  const warnings: string[] = []
  const errors: string[] = []
  const stats: AgentImportResult['stats'] = {
    registryImported: false,
    databaseImported: false,
    messagesImported: {
      inbox: 0,
      sent: 0,
      archived: 0
    },
    repositoriesCloned: 0,
    repositoriesSkipped: 0,
    keysImported: false,
    keysGenerated: false,
    registrationsImported: 0
  }
  const repositoryResults: RepositoryImportResult[] = []

  let tempDir: string | null = null

  try {
    tempDir = path.join(os.tmpdir(), `aimaestro-import-${Date.now()}`)
    ensureDir(tempDir)

    await extractZip(zipBuffer, tempDir)

    // Read manifest
    const manifestPath = path.join(tempDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      return { error: 'Invalid agent export: missing manifest.json', status: 400 }
    }

    const manifest: AgentExportManifest = JSON.parse(
      fs.readFileSync(manifestPath, 'utf-8')
    )

    const supportedVersions = ['1.0.0', '1.1.0', '1.2.0']
    if (!manifest.version || !supportedVersions.includes(manifest.version)) {
      warnings.push(`Unknown manifest version: ${manifest.version}. Import may have issues.`)
    }

    // Read registry
    const registryPath = path.join(tempDir, 'registry.json')
    if (!fs.existsSync(registryPath)) {
      return { error: 'Invalid agent export: missing registry.json', status: 400 }
    }

    const importedAgent: Agent = JSON.parse(
      fs.readFileSync(registryPath, 'utf-8')
    )

    const importedAgentName = importedAgent.name || importedAgent.alias
    if (!importedAgentName) {
      return { error: 'Invalid agent export: agent has no name', status: 400 }
    }

    // Check for name conflict
    const newAgentName = options.newName || options.newAlias || importedAgentName
    const existingAgent = getAgentByName(newAgentName) || getAgentByAlias(newAgentName)
    if (existingAgent && !options.overwrite) {
      return {
        data: {
          success: false,
          warnings,
          errors: [`Agent with name "${newAgentName}" already exists. Use overwrite option to replace.`],
          stats,
          existingAgentId: existingAgent.id
        } as AgentImportResult & { existingAgentId: string },
        status: 409
      }
    }

    // Prepare agent for import
    const newAgentId = options.newId ? uuidv4() : importedAgent.id

    const agentToImport: Agent = {
      ...importedAgent,
      id: newAgentId,
      name: newAgentName,
      alias: newAgentName,
      workingDirectory: importedAgent.workingDirectory,
      deployment: {
        type: 'local',
        local: {
          hostname: os.hostname(),
          platform: os.platform()
        }
      },
      sessions: (importedAgent.sessions || []).map(s => ({
        ...s,
        status: 'offline' as const
      })),
      status: 'offline',
      lastActive: new Date().toISOString()
    }

    // Import to registry
    const agents = loadAgents()

    if (existingAgent && options.overwrite) {
      const filteredAgents = agents.filter(a => a.id !== existingAgent.id)
      filteredAgents.push(agentToImport)
      saveAgents(filteredAgents)
      warnings.push(`Overwrote existing agent with name "${newAgentName}"`)
    } else {
      const existingById = agents.find(a => a.id === newAgentId)
      if (existingById) {
        agentToImport.id = uuidv4()
        warnings.push(`Agent ID was changed to avoid conflict`)
      }
      agents.push(agentToImport)
      saveAgents(agents)
    }
    stats.registryImported = true

    // Import database
    const dbPath = path.join(tempDir, 'agent.db')
    if (fs.existsSync(dbPath)) {
      const targetDbDir = path.join(AGENTS_DIR, agentToImport.id)
      ensureDir(targetDbDir)
      const targetDbPath = path.join(targetDbDir, 'agent.db')
      fs.copyFileSync(dbPath, targetDbPath)
      stats.databaseImported = true
    } else if (manifest.contents.hasDatabase) {
      warnings.push('Manifest indicated database exists but agent.db not found in archive')
    }

    // Import messages
    if (!options.skipMessages) {
      const messagesDir = path.join(tempDir, 'messages')
      if (fs.existsSync(messagesDir)) {
        for (const folder of ['inbox', 'sent', 'archived'] as const) {
          const src = path.join(messagesDir, folder)
          if (fs.existsSync(src)) {
            const dest = path.join(MESSAGES_DIR, folder, newAgentName)
            ensureDir(dest)
            const files = fs.readdirSync(src).filter(f => f.endsWith('.json'))
            for (const file of files) {
              fs.copyFileSync(path.join(src, file), path.join(dest, file))
              stats.messagesImported[folder]++
            }
          }
        }
      }
    }

    // Clone repositories
    const clonedRepos: Repository[] = []
    if (options.cloneRepositories && manifest.repositories && manifest.repositories.length > 0) {
      for (const repo of manifest.repositories) {
        const mapping = options.repositoryMappings?.find(m => m.remoteUrl === repo.remoteUrl)
        if (mapping?.skip) {
          repositoryResults.push({
            name: repo.name,
            remoteUrl: repo.remoteUrl,
            status: 'skipped'
          })
          stats.repositoriesSkipped = (stats.repositoriesSkipped || 0) + 1
          continue
        }

        let targetPath: string
        if (mapping?.localPath) {
          targetPath = mapping.localPath
        } else if (repo.originalPath) {
          targetPath = repo.originalPath
        } else {
          targetPath = path.join(os.homedir(), 'repos', repo.name)
        }

        const result = cloneRepository(repo, targetPath)
        repositoryResults.push(result)

        if (result.status === 'cloned') {
          stats.repositoriesCloned = (stats.repositoriesCloned || 0) + 1
          clonedRepos.push({
            name: repo.name,
            remoteUrl: repo.remoteUrl,
            localPath: result.localPath!,
            defaultBranch: repo.defaultBranch,
            isPrimary: repo.isPrimary,
            lastSynced: new Date().toISOString()
          })
        } else if (result.status === 'exists') {
          clonedRepos.push({
            name: repo.name,
            remoteUrl: repo.remoteUrl,
            localPath: result.localPath!,
            defaultBranch: repo.defaultBranch,
            isPrimary: repo.isPrimary
          })
          warnings.push(`Repository ${repo.name} already exists at ${result.localPath}`)
        } else if (result.status === 'failed') {
          warnings.push(`Failed to clone ${repo.name}: ${result.error}`)
        }
      }

      if (clonedRepos.length > 0) {
        const agents = loadAgents()
        const agentIndex = agents.findIndex(a => a.id === agentToImport.id)
        if (agentIndex >= 0) {
          agents[agentIndex].tools.repositories = clonedRepos
          const primaryRepo = clonedRepos.find(r => r.isPrimary) || clonedRepos[0]
          if (primaryRepo && !agents[agentIndex].workingDirectory) {
            agents[agentIndex].workingDirectory = primaryRepo.localPath
            if (!agents[agentIndex].preferences) {
              agents[agentIndex].preferences = {}
            }
            agents[agentIndex].preferences!.defaultWorkingDirectory = primaryRepo.localPath
          }
          saveAgents(agents)
          agentToImport.tools.repositories = clonedRepos
        }
      }
    }

    // Import skills
    const skillsDir = path.join(tempDir, 'skills')
    if (fs.existsSync(skillsDir) && !options.skipSkills) {
      const targetSkillsDir = path.join(AGENTS_DIR, agentToImport.id, 'skills')
      ensureDir(targetSkillsDir)

      const customSkillsDir = path.join(skillsDir, 'custom')
      if (fs.existsSync(customSkillsDir)) {
        const skillFolders = fs.readdirSync(customSkillsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())

        for (const skillFolder of skillFolders) {
          const srcPath = path.join(customSkillsDir, skillFolder.name)
          const destPath = path.join(targetSkillsDir, skillFolder.name)
          ensureDir(destPath)

          const files = fs.readdirSync(srcPath)
          for (const file of files) {
            fs.copyFileSync(path.join(srcPath, file), path.join(destPath, file))
          }
        }
      }
    }

    // Import hooks
    const hooksDir = path.join(tempDir, 'hooks')
    if (fs.existsSync(hooksDir) && !options.skipHooks) {
      const targetHooksDir = path.join(AGENTS_DIR, agentToImport.id, 'hooks')
      ensureDir(targetHooksDir)

      const hooksManifestPath = path.join(hooksDir, 'hooks.json')
      if (fs.existsSync(hooksManifestPath)) {
        const hooksManifest = JSON.parse(fs.readFileSync(hooksManifestPath, 'utf-8'))

        const hookFiles = fs.readdirSync(hooksDir).filter(f => f !== 'hooks.json')
        for (const file of hookFiles) {
          fs.copyFileSync(path.join(hooksDir, file), path.join(targetHooksDir, file))
        }

        const agents = loadAgents()
        const agentIndex = agents.findIndex(a => a.id === agentToImport.id)
        if (agentIndex >= 0) {
          const updatedHooks: Record<string, string> = {}
          for (const [event, _scriptPath] of Object.entries(hooksManifest)) {
            const hookFile = hookFiles.find(f => f === path.basename(_scriptPath as string))
            if (hookFile) {
              updatedHooks[event] = `./hooks/${hookFile}`
            }
          }
          agents[agentIndex].hooks = updatedHooks
          saveAgents(agents)
          agentToImport.hooks = updatedHooks
        }
      }
    }

    // Import AMP keys
    const keysDir = path.join(tempDir, 'keys')
    if (fs.existsSync(keysDir) && !options.skipKeys) {
      const targetKeysDir = getKeysDir(agentToImport.id)
      ensureDir(targetKeysDir)

      const privateKeyPath = path.join(keysDir, 'private.pem')
      const publicKeyPath = path.join(keysDir, 'public.pem')

      if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
        fs.copyFileSync(privateKeyPath, path.join(targetKeysDir, 'private.pem'))
        fs.chmodSync(path.join(targetKeysDir, 'private.pem'), 0o600)

        fs.copyFileSync(publicKeyPath, path.join(targetKeysDir, 'public.pem'))
        fs.chmodSync(path.join(targetKeysDir, 'public.pem'), 0o644)

        stats.keysImported = true

        try {
          const { createPublicKey, createHash } = require('crypto')
          const publicPem = fs.readFileSync(path.join(targetKeysDir, 'public.pem'), 'utf-8')
          const pubKeyObj = createPublicKey(publicPem)
          const rawPubKey = pubKeyObj.export({ type: 'spki', format: 'der' })
          const publicKeyBytes = rawPubKey.subarray(12)
          const publicHex = publicKeyBytes.toString('hex')
          const fingerprint = `SHA256:${createHash('sha256').update(publicKeyBytes).digest('base64')}`

          const agents = loadAgents()
          const agentIndex = agents.findIndex(a => a.id === agentToImport.id)
          if (agentIndex >= 0) {
            agents[agentIndex].ampIdentity = {
              fingerprint,
              publicKeyHex: publicHex,
              keyAlgorithm: 'Ed25519',
              createdAt: new Date().toISOString(),
              ampAddress: `${newAgentName}@default.aimaestro.local`,
              tenant: 'default'
            }
            saveAgents(agents)
            agentToImport.ampIdentity = agents[agentIndex].ampIdentity
          }
        } catch (error) {
          warnings.push(`Failed to extract AMP identity from imported keys: ${error}`)
        }
      } else {
        warnings.push('Keys directory exists but missing private.pem or public.pem')
      }
    } else if (!options.skipKeys && manifest.contents?.hasKeys) {
      try {
        const keyPair = await generateKeyPair()
        saveKeyPair(agentToImport.id, keyPair)
        stats.keysGenerated = true
        warnings.push('Original keys not found in export - generated new keypair')

        const agents = loadAgents()
        const agentIndex = agents.findIndex(a => a.id === agentToImport.id)
        if (agentIndex >= 0) {
          agents[agentIndex].ampIdentity = {
            fingerprint: keyPair.fingerprint,
            publicKeyHex: keyPair.publicHex,
            keyAlgorithm: 'Ed25519',
            createdAt: new Date().toISOString(),
            ampAddress: `${newAgentName}@default.aimaestro.local`,
            tenant: 'default'
          }
          saveAgents(agents)
          agentToImport.ampIdentity = agents[agentIndex].ampIdentity
        }
      } catch (error) {
        warnings.push(`Failed to generate new keypair: ${error}`)
      }
    }

    // Import registrations
    const registrationsDir = path.join(tempDir, 'registrations')
    if (fs.existsSync(registrationsDir) && !options.skipRegistrations) {
      const targetRegistrationsDir = getRegistrationsDir(agentToImport.id)
      ensureDir(targetRegistrationsDir)

      const registrationFiles = fs.readdirSync(registrationsDir).filter(f => f.endsWith('.json'))
      for (const file of registrationFiles) {
        fs.copyFileSync(
          path.join(registrationsDir, file),
          path.join(targetRegistrationsDir, file)
        )
        fs.chmodSync(path.join(targetRegistrationsDir, file), 0o600)
        stats.registrationsImported = (stats.registrationsImported || 0) + 1
      }

      if (stats.registrationsImported && stats.registrationsImported > 0) {
        warnings.push(`Imported ${stats.registrationsImported} external provider registration(s). API keys may need to be re-validated.`)
      }
    }

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true })
    tempDir = null

    const result: AgentImportResult = {
      success: true,
      agent: agentToImport,
      warnings,
      errors,
      stats,
      repositoryResults: repositoryResults.length > 0 ? repositoryResults : undefined
    }

    return { data: result, status: 200 }

  } catch (error) {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    }

    console.error('Failed to import agent:', error)
    errors.push(error instanceof Error ? error.message : 'Unknown error')

    const result: AgentImportResult = {
      success: false,
      warnings,
      errors,
      stats
    }

    return { data: result, status: 500 }
  }
}

/**
 * Transfer an agent to another AI Maestro instance.
 */
export async function transferAgent(
  agentIdOrName: string,
  body: TransferRequest
): Promise<ServiceResult<TransferResult>> {
  const agent = resolveAgent(agentIdOrName)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  const { targetHostUrl, mode, newAlias, cloneRepositories } = body

  if (!targetHostUrl) {
    return { error: 'Target host URL required', status: 400 }
  }

  let normalizedUrl = targetHostUrl.trim()
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `http://${normalizedUrl}`
  }
  normalizedUrl = normalizedUrl.replace(/\/+$/, '')

  // Step 1: Export the agent
  const selfHost = getSelfHost()
  const exportResponse = await fetch(`${selfHost.url}/api/agents/${agent.id}/export`)

  if (!exportResponse.ok) {
    const errorText = await exportResponse.text()
    return { error: `Failed to export agent: ${errorText}`, status: 500 }
  }

  const exportBuffer = Buffer.from(await exportResponse.arrayBuffer())

  // Step 2: Send to target host
  const formData = new FormData()
  const blob = new Blob([exportBuffer], { type: 'application/zip' })
  formData.append('file', blob, `${agent.alias || agent.id}.zip`)

  const importOptions: Record<string, unknown> = {}
  if (newAlias) {
    importOptions.newAlias = newAlias
  }
  if (cloneRepositories) {
    importOptions.cloneRepositories = true
  }
  formData.append('options', JSON.stringify(importOptions))

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
    return { error: errorMessage, status: 500 }
  }

  const importResult = await importResponse.json()

  // Step 3: If move mode, delete the local agent
  if (mode === 'move') {
    try {
      const agentDir = path.join(AGENTS_DIR, agent.id)
      if (fs.existsSync(agentDir)) {
        fs.rmSync(agentDir, { recursive: true })
      }

      const sessionName = agent.name || agent.alias
      if (sessionName) {
        const inboxDir = path.join(MESSAGES_DIR, 'inbox', sessionName)
        const sentDir = path.join(MESSAGES_DIR, 'sent', sessionName)
        const archivedDir = path.join(MESSAGES_DIR, 'archived', sessionName)

        if (fs.existsSync(inboxDir)) fs.rmSync(inboxDir, { recursive: true })
        if (fs.existsSync(sentDir)) fs.rmSync(sentDir, { recursive: true })
        if (fs.existsSync(archivedDir)) fs.rmSync(archivedDir, { recursive: true })
      }

      const agents = loadAgents()
      const filteredAgents = agents.filter(a => a.id !== agent.id)
      saveAgents(filteredAgents)
    } catch (deleteError) {
      console.error('Failed to delete source agent after move:', deleteError)
      return {
        data: {
          success: true,
          mode,
          newAgentId: importResult.agent?.id,
          newAlias: importResult.agent?.alias,
          targetHost: normalizedUrl,
          warning: 'Agent transferred but failed to delete source. Manual cleanup may be needed.',
          importResult
        },
        status: 200
      }
    }
  }

  return {
    data: {
      success: true,
      mode,
      newAgentId: importResult.agent?.id,
      newAlias: importResult.agent?.alias,
      targetHost: normalizedUrl,
      importResult
    },
    status: 200
  }
}

import { NextResponse } from 'next/server'
import { loadAgents, saveAgents, getAgentByAlias, getAgentByName } from '@/lib/agent-registry'
import { getKeysDir, getRegistrationsDir, generateKeyPair, saveKeyPair } from '@/lib/amp-keys'
import yauzl from 'yauzl'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { execSync } from 'child_process'
import type { Agent, Repository, AMPAgentIdentity } from '@/types/agent'
import type { AgentExportManifest, AgentImportOptions, AgentImportResult, PortableRepository, RepositoryImportResult } from '@/types/portable'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const AGENTS_DIR = path.join(AIMAESTRO_DIR, 'agents')
const MESSAGES_DIR = path.join(AIMAESTRO_DIR, 'messages')

/**
 * Ensure directory exists
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * Clone a git repository
 * Returns the result of the clone operation
 */
function cloneRepository(
  repo: PortableRepository,
  targetPath: string
): RepositoryImportResult {
  try {
    // Check if directory already exists
    if (fs.existsSync(targetPath)) {
      // Check if it's already a git repo with the same remote
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
      // Directory exists but isn't the same repo
      return {
        name: repo.name,
        remoteUrl: repo.remoteUrl,
        status: 'failed',
        localPath: targetPath,
        error: `Directory ${targetPath} already exists`
      }
    }

    // Ensure parent directory exists
    ensureDir(path.dirname(targetPath))

    // Clone the repository
    const branch = repo.defaultBranch || 'main'
    execSync(`git clone --branch ${branch} "${repo.remoteUrl}" "${targetPath}"`, {
      encoding: 'utf-8',
      timeout: 300000, // 5 minute timeout for large repos
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

/**
 * Extract ZIP file to temp directory using yauzl
 */
async function extractZip(zipBuffer: Buffer, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Write buffer to temp file (yauzl requires a file path)
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

        // Directory entry
        if (/\/$/.test(entry.fileName)) {
          ensureDir(fullPath)
          zipfile.readEntry()
          return
        }

        // Ensure parent directory exists
        ensureDir(path.dirname(fullPath))

        // File entry
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
 * POST /api/agents/import
 * Import an agent from a ZIP file
 *
 * Body: multipart/form-data with:
 * - file: ZIP file
 * - options: JSON string with import options (optional)
 */
export async function POST(request: Request) {
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
    // AMP Identity stats (v1.2.0)
    keysImported: false,
    keysGenerated: false,
    registrationsImported: 0
  }
  const repositoryResults: RepositoryImportResult[] = []

  let tempDir: string | null = null

  try {
    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const optionsStr = formData.get('options') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Parse options
    const options: AgentImportOptions = optionsStr ? JSON.parse(optionsStr) : {}

    // Create temp directory for extraction
    tempDir = path.join(os.tmpdir(), `aimaestro-import-${Date.now()}`)
    ensureDir(tempDir)

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract ZIP to temp directory
    await extractZip(buffer, tempDir)

    // Read manifest
    const manifestPath = path.join(tempDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      return NextResponse.json(
        { error: 'Invalid agent export: missing manifest.json' },
        { status: 400 }
      )
    }

    const manifest: AgentExportManifest = JSON.parse(
      fs.readFileSync(manifestPath, 'utf-8')
    )

    // Validate manifest version
    const supportedVersions = ['1.0.0', '1.1.0', '1.2.0']
    if (!manifest.version || !supportedVersions.includes(manifest.version)) {
      warnings.push(`Unknown manifest version: ${manifest.version}. Import may have issues.`)
    }

    // Read registry (agent data)
    const registryPath = path.join(tempDir, 'registry.json')
    if (!fs.existsSync(registryPath)) {
      return NextResponse.json(
        { error: 'Invalid agent export: missing registry.json' },
        { status: 400 }
      )
    }

    const importedAgent: Agent = JSON.parse(
      fs.readFileSync(registryPath, 'utf-8')
    )

    // Get agent name (new field, fallback to deprecated alias)
    const importedAgentName = importedAgent.name || importedAgent.alias
    if (!importedAgentName) {
      return NextResponse.json(
        { error: 'Invalid agent export: agent has no name' },
        { status: 400 }
      )
    }

    // Check for name conflict (check both new name field and deprecated alias)
    const newAgentName = options.newName || options.newAlias || importedAgentName
    const existingAgent = getAgentByName(newAgentName) || getAgentByAlias(newAgentName)
    if (existingAgent && !options.overwrite) {
      return NextResponse.json(
        {
          error: `Agent with name "${newAgentName}" already exists. Use overwrite option to replace.`,
          existingAgentId: existingAgent.id
        },
        { status: 409 }
      )
    }

    // Prepare the agent for import
    const newAgentId = options.newId ? uuidv4() : importedAgent.id

    // Update agent with new values and local deployment info
    const agentToImport: Agent = {
      ...importedAgent,
      id: newAgentId,
      name: newAgentName,
      alias: newAgentName, // Keep for backwards compatibility
      workingDirectory: importedAgent.workingDirectory,
      deployment: {
        type: 'local',
        local: {
          hostname: os.hostname(),
          platform: os.platform()
        }
      },
      // Reset sessions to offline - will be recreated when woken
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
      // Remove existing agent
      const filteredAgents = agents.filter(a => a.id !== existingAgent.id)
      filteredAgents.push(agentToImport)
      saveAgents(filteredAgents)
      warnings.push(`Overwrote existing agent with name "${newAgentName}"`)
    } else {
      // Check if ID already exists
      const existingById = agents.find(a => a.id === newAgentId)
      if (existingById) {
        // Generate new ID if there's a conflict
        agentToImport.id = uuidv4()
        warnings.push(`Agent ID was changed to avoid conflict`)
      }
      agents.push(agentToImport)
      saveAgents(agents)
    }
    stats.registryImported = true

    // Import database if exists and not skipped
    const dbPath = path.join(tempDir, 'agent.db')
    if (fs.existsSync(dbPath)) {
      const targetDbDir = path.join(AGENTS_DIR, agentToImport.id)
      ensureDir(targetDbDir)
      const targetDbPath = path.join(targetDbDir, 'agent.db')

      // Copy database file
      fs.copyFileSync(dbPath, targetDbPath)
      stats.databaseImported = true
    } else if (manifest.contents.hasDatabase) {
      warnings.push('Manifest indicated database exists but agent.db not found in archive')
    }

    // Import messages if exists and not skipped
    if (!options.skipMessages) {
      const messagesDir = path.join(tempDir, 'messages')

      if (fs.existsSync(messagesDir)) {
        // Import inbox
        const inboxSrc = path.join(messagesDir, 'inbox')
        if (fs.existsSync(inboxSrc)) {
          const inboxDest = path.join(MESSAGES_DIR, 'inbox', newAgentName)
          ensureDir(inboxDest)

          const files = fs.readdirSync(inboxSrc).filter(f => f.endsWith('.json'))
          for (const file of files) {
            fs.copyFileSync(path.join(inboxSrc, file), path.join(inboxDest, file))
            stats.messagesImported.inbox++
          }
        }

        // Import sent
        const sentSrc = path.join(messagesDir, 'sent')
        if (fs.existsSync(sentSrc)) {
          const sentDest = path.join(MESSAGES_DIR, 'sent', newAgentName)
          ensureDir(sentDest)

          const files = fs.readdirSync(sentSrc).filter(f => f.endsWith('.json'))
          for (const file of files) {
            fs.copyFileSync(path.join(sentSrc, file), path.join(sentDest, file))
            stats.messagesImported.sent++
          }
        }

        // Import archived
        const archivedSrc = path.join(messagesDir, 'archived')
        if (fs.existsSync(archivedSrc)) {
          const archivedDest = path.join(MESSAGES_DIR, 'archived', newAgentName)
          ensureDir(archivedDest)

          const files = fs.readdirSync(archivedSrc).filter(f => f.endsWith('.json'))
          for (const file of files) {
            fs.copyFileSync(path.join(archivedSrc, file), path.join(archivedDest, file))
            stats.messagesImported.archived++
          }
        }
      }
    }

    // Clone repositories if requested
    const clonedRepos: Repository[] = []
    if (options.cloneRepositories && manifest.repositories && manifest.repositories.length > 0) {
      for (const repo of manifest.repositories) {
        // Check if this repo should be skipped via mapping
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

        // Determine target path
        let targetPath: string
        if (mapping?.localPath) {
          targetPath = mapping.localPath
        } else if (repo.originalPath) {
          // Use original path as default (same structure on new machine)
          targetPath = repo.originalPath
        } else {
          // Fallback to ~/repos/<name>
          targetPath = path.join(os.homedir(), 'repos', repo.name)
        }

        // Clone the repository
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
          // Repo already exists at path - still add to agent's repos
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

      // Update agent with cloned repositories
      if (clonedRepos.length > 0) {
        const agents = loadAgents()
        const agentIndex = agents.findIndex(a => a.id === agentToImport.id)
        if (agentIndex >= 0) {
          agents[agentIndex].tools.repositories = clonedRepos
          // Update working directory to primary repo if agent doesn't have one
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

    // Import skills if present (v1.1.0)
    const skillsDir = path.join(tempDir, 'skills')
    if (fs.existsSync(skillsDir) && !options.skipSkills) {
      const targetSkillsDir = path.join(AGENTS_DIR, agentToImport.id, 'skills')
      ensureDir(targetSkillsDir)

      // Import custom skills
      const customSkillsDir = path.join(skillsDir, 'custom')
      if (fs.existsSync(customSkillsDir)) {
        const skillFolders = fs.readdirSync(customSkillsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())

        for (const skillFolder of skillFolders) {
          const srcPath = path.join(customSkillsDir, skillFolder.name)
          const destPath = path.join(targetSkillsDir, skillFolder.name)
          ensureDir(destPath)

          // Copy skill files
          const files = fs.readdirSync(srcPath)
          for (const file of files) {
            fs.copyFileSync(path.join(srcPath, file), path.join(destPath, file))
          }
        }
      }

      // Note: Marketplace skills are stored as references, not files
      // The SKILL.md files are bundled for portability but we just restore
      // the references from the agent's skills config
    }

    // Import hooks if present
    const hooksDir = path.join(tempDir, 'hooks')
    if (fs.existsSync(hooksDir) && !options.skipHooks) {
      const targetHooksDir = path.join(AGENTS_DIR, agentToImport.id, 'hooks')
      ensureDir(targetHooksDir)

      // Read hooks manifest if exists
      const hooksManifestPath = path.join(hooksDir, 'hooks.json')
      if (fs.existsSync(hooksManifestPath)) {
        const hooksManifest = JSON.parse(fs.readFileSync(hooksManifestPath, 'utf-8'))

        // Copy hook scripts
        const hookFiles = fs.readdirSync(hooksDir).filter(f => f !== 'hooks.json')
        for (const file of hookFiles) {
          fs.copyFileSync(path.join(hooksDir, file), path.join(targetHooksDir, file))
        }

        // Update agent with hooks config
        const agents = loadAgents()
        const agentIndex = agents.findIndex(a => a.id === agentToImport.id)
        if (agentIndex >= 0) {
          // Update hook paths to new location
          const updatedHooks: Record<string, string> = {}
          for (const [event, _scriptPath] of Object.entries(hooksManifest)) {
            // Find the matching hook file
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

    // Import AMP keys if present (v1.2.0)
    const keysDir = path.join(tempDir, 'keys')
    if (fs.existsSync(keysDir) && !options.skipKeys) {
      const targetKeysDir = getKeysDir(agentToImport.id)
      ensureDir(targetKeysDir)

      // Copy key files with proper permissions
      const privateKeyPath = path.join(keysDir, 'private.pem')
      const publicKeyPath = path.join(keysDir, 'public.pem')

      if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
        fs.copyFileSync(privateKeyPath, path.join(targetKeysDir, 'private.pem'))
        fs.chmodSync(path.join(targetKeysDir, 'private.pem'), 0o600)

        fs.copyFileSync(publicKeyPath, path.join(targetKeysDir, 'public.pem'))
        fs.chmodSync(path.join(targetKeysDir, 'public.pem'), 0o644)

        stats.keysImported = true

        // Update agent with AMP identity info from imported keys
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
      // Keys were expected but not found - generate new ones
      try {
        const keyPair = await generateKeyPair()
        saveKeyPair(agentToImport.id, keyPair)
        stats.keysGenerated = true
        warnings.push('Original keys not found in export - generated new keypair')

        // Update agent with new AMP identity
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

    // Import external registrations if present (v1.2.0)
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
        // Secure permissions for registration files (contain API keys)
        fs.chmodSync(path.join(targetRegistrationsDir, file), 0o600)
        stats.registrationsImported = (stats.registrationsImported || 0) + 1
      }

      if (stats.registrationsImported && stats.registrationsImported > 0) {
        warnings.push(`Imported ${stats.registrationsImported} external provider registration(s). API keys may need to be re-validated.`)
      }
    }

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true })
    tempDir = null

    // Build result
    const result: AgentImportResult = {
      success: true,
      agent: agentToImport,
      warnings,
      errors,
      stats,
      repositoryResults: repositoryResults.length > 0 ? repositoryResults : undefined
    }

    return NextResponse.json(result)

  } catch (error) {
    // Clean up temp directory on error
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

    return NextResponse.json(result, { status: 500 })
  }
}

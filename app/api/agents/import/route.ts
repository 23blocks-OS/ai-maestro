import { NextResponse } from 'next/server'
import { loadAgents, saveAgents, getAgentByAlias } from '@/lib/agent-registry'
import yauzl from 'yauzl'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { promisify } from 'util'
import type { Agent } from '@/types/agent'
import type { AgentExportManifest, AgentImportOptions, AgentImportResult } from '@/types/portable'

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
  const stats = {
    registryImported: false,
    databaseImported: false,
    messagesImported: {
      inbox: 0,
      sent: 0,
      archived: 0
    }
  }

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
    if (!manifest.version || manifest.version !== '1.0.0') {
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

    // Check for alias conflict
    const existingAgent = getAgentByAlias(options.newAlias || importedAgent.alias)
    if (existingAgent && !options.overwrite) {
      return NextResponse.json(
        {
          error: `Agent with alias "${options.newAlias || importedAgent.alias}" already exists. Use overwrite option to replace.`,
          existingAgentId: existingAgent.id
        },
        { status: 409 }
      )
    }

    // Prepare the agent for import
    const newAgentId = options.newId ? uuidv4() : importedAgent.id
    const newAlias = options.newAlias || importedAgent.alias

    // Determine session name (for messages)
    const newSessionName = newAlias

    // Update agent with new values and local deployment info
    const agentToImport: Agent = {
      ...importedAgent,
      id: newAgentId,
      alias: newAlias,
      deployment: {
        type: 'local',
        local: {
          hostname: os.hostname(),
          platform: os.platform()
        }
      },
      tools: {
        ...importedAgent.tools,
        session: importedAgent.tools.session ? {
          ...importedAgent.tools.session,
          tmuxSessionName: newSessionName,
          status: 'stopped'
        } : undefined
      },
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
      warnings.push(`Overwrote existing agent with alias "${newAlias}"`)
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
          const inboxDest = path.join(MESSAGES_DIR, 'inbox', newSessionName)
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
          const sentDest = path.join(MESSAGES_DIR, 'sent', newSessionName)
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
          const archivedDest = path.join(MESSAGES_DIR, 'archived', newSessionName)
          ensureDir(archivedDest)

          const files = fs.readdirSync(archivedSrc).filter(f => f.endsWith('.json'))
          for (const file of files) {
            fs.copyFileSync(path.join(archivedSrc, file), path.join(archivedDest, file))
            stats.messagesImported.archived++
          }
        }
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
      stats
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

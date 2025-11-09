/**
 * Agent Pack/Unpack Utilities
 *
 * Allows agents to be exported, cloned, moved to another host, or distributed as packages.
 * A pack includes: agent metadata, database, messages, notes, and optionally workspace files.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { getAgent, createAgent, saveAgents, loadAgents } from './agent-registry'
import type { Agent } from '@/types/agent'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const AGENTS_DIR = path.join(AIMAESTRO_DIR, 'agents')
const MESSAGES_DIR = path.join(AIMAESTRO_DIR, 'messages')

export interface PackOptions {
  agentId: string
  includeWorkspace?: boolean
  includeMessages?: boolean
  includeSkills?: boolean
  outputPath?: string
}

export interface UnpackOptions {
  packFile: string
  newAlias?: string
  restoreToId?: boolean
  targetDirectory?: string
}

export interface PackManifest {
  version: string
  packDate: string
  agent: {
    id: string
    alias: string
    displayName: string
  }
  includes: {
    database: boolean
    messages: boolean
    workspace: boolean
    skills: boolean
    notes: boolean
  }
  workspace?: {
    path: string
    size: number
  }
  skills?: string[]  // List of skill names included
}

export interface PackResult {
  packFile: string
  size: number
  manifest: PackManifest
}

/**
 * Pack an agent into a distributable tarball
 */
export async function packAgent(options: PackOptions): Promise<PackResult> {
  const { agentId, includeWorkspace = false, includeMessages = true, includeSkills = true, outputPath } = options

  // Get agent
  const agent = getAgent(agentId)
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`)
  }

  // Create temporary pack directory
  const timestamp = Date.now()
  const packDirName = `agent-pack-${agent.alias}-${timestamp}`
  const tempDir = path.join(os.tmpdir(), packDirName)

  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true })
  }
  fs.mkdirSync(tempDir, { recursive: true })

  console.log(`[Pack] Creating pack for agent: ${agent.alias}`)
  console.log(`[Pack] Temporary directory: ${tempDir}`)

  // 1. Write agent metadata
  const agentFile = path.join(tempDir, 'agent.json')
  fs.writeFileSync(agentFile, JSON.stringify(agent, null, 2))
  console.log(`[Pack] ✓ Exported agent metadata`)

  // 2. Copy database if it exists
  const agentDbPath = path.join(AGENTS_DIR, agentId, 'agent.db')
  let hasDatabase = false
  if (fs.existsSync(agentDbPath)) {
    const dbDir = path.join(tempDir, 'database')
    fs.mkdirSync(dbDir, { recursive: true })
    fs.copyFileSync(agentDbPath, path.join(dbDir, 'agent.db'))
    console.log(`[Pack] ✓ Copied database (${getFileSize(agentDbPath)})`)
    hasDatabase = true
  } else {
    console.log(`[Pack] ⊘ No database found`)
  }

  // 3. Copy messages if requested
  let hasMessages = false
  if (includeMessages && agent.tools.session?.tmuxSessionName) {
    const sessionName = agent.tools.session.tmuxSessionName
    const inboxPath = path.join(MESSAGES_DIR, 'inbox', sessionName)
    const sentPath = path.join(MESSAGES_DIR, 'sent', sessionName)

    const messagesDir = path.join(tempDir, 'messages')
    fs.mkdirSync(messagesDir, { recursive: true })

    if (fs.existsSync(inboxPath)) {
      const targetInbox = path.join(messagesDir, 'inbox')
      fs.mkdirSync(targetInbox, { recursive: true })
      copyDirectory(inboxPath, targetInbox)
      console.log(`[Pack] ✓ Copied inbox messages`)
      hasMessages = true
    }

    if (fs.existsSync(sentPath)) {
      const targetSent = path.join(messagesDir, 'sent')
      fs.mkdirSync(targetSent, { recursive: true })
      copyDirectory(sentPath, targetSent)
      console.log(`[Pack] ✓ Copied sent messages`)
      hasMessages = true
    }

    if (!hasMessages) {
      console.log(`[Pack] ⊘ No messages found`)
    }
  }

  // 4. Copy workspace if requested
  let workspaceSize = 0
  let workspacePath = ''
  if (includeWorkspace && agent.tools.session?.workingDirectory) {
    workspacePath = agent.tools.session.workingDirectory

    if (fs.existsSync(workspacePath)) {
      const workspaceDir = path.join(tempDir, 'workspace')
      fs.mkdirSync(workspaceDir, { recursive: true })

      console.log(`[Pack] Copying workspace (this may take a while)...`)
      copyDirectory(workspacePath, workspaceDir, ['.git', 'node_modules', '.next', 'dist', 'build'])

      workspaceSize = getDirectorySize(workspaceDir)
      console.log(`[Pack] ✓ Copied workspace (${formatBytes(workspaceSize)})`)
    } else {
      console.log(`[Pack] ⚠ Workspace directory not found: ${workspacePath}`)
    }
  }

  // 5. Copy Claude Code skills if requested
  let hasSkills = false
  const skillNames: string[] = []
  if (includeSkills) {
    const claudeSkillsPath = path.join(os.homedir(), '.claude', 'skills')

    if (fs.existsSync(claudeSkillsPath)) {
      const skillsDir = path.join(tempDir, 'skills')
      fs.mkdirSync(skillsDir, { recursive: true })

      console.log(`[Pack] Copying Claude Code skills...`)

      const skillDirs = fs.readdirSync(claudeSkillsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())

      for (const dirent of skillDirs) {
        const skillName = dirent.name
        const sourcePath = path.join(claudeSkillsPath, skillName)
        const targetPath = path.join(skillsDir, skillName)

        copyDirectory(sourcePath, targetPath)
        skillNames.push(skillName)
        console.log(`[Pack] ✓ Copied skill: ${skillName}`)
      }

      hasSkills = skillNames.length > 0
      if (hasSkills) {
        console.log(`[Pack] ✓ Copied ${skillNames.length} skill(s)`)
      }
    } else {
      console.log(`[Pack] ⊘ No Claude Code skills directory found`)
    }
  }

  // 6. Export session notes (from localStorage - would need to be handled client-side)
  // For now, we'll create a placeholder
  const notesFile = path.join(tempDir, 'notes.json')
  fs.writeFileSync(notesFile, JSON.stringify({
    note: 'Session notes should be exported from browser localStorage',
    sessionId: agent.tools.session?.tmuxSessionName || null
  }, null, 2))

  // 7. Create manifest
  const manifest: PackManifest = {
    version: '1.0.0',
    packDate: new Date().toISOString(),
    agent: {
      id: agent.id,
      alias: agent.alias,
      displayName: agent.displayName || agent.alias,
    },
    includes: {
      database: hasDatabase,
      messages: hasMessages,
      workspace: includeWorkspace && workspaceSize > 0,
      skills: hasSkills,
      notes: false, // Client-side only for now
    },
    ...(includeWorkspace && workspaceSize > 0 && {
      workspace: {
        path: workspacePath,
        size: workspaceSize,
      }
    }),
    ...(hasSkills && skillNames.length > 0 && {
      skills: skillNames
    })
  }

  const manifestFile = path.join(tempDir, 'manifest.json')
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
  console.log(`[Pack] ✓ Created manifest`)

  // 8. Create tarball
  const outputFile = outputPath || path.join(os.tmpdir(), `${packDirName}.tar.gz`)
  console.log(`[Pack] Creating tarball...`)

  execSync(`tar -czf "${outputFile}" -C "${path.dirname(tempDir)}" "${packDirName}"`, {
    stdio: 'inherit'
  })

  const packSize = fs.statSync(outputFile).size
  console.log(`[Pack] ✓ Created pack: ${outputFile} (${formatBytes(packSize)})`)

  // Cleanup temp directory
  fs.rmSync(tempDir, { recursive: true })

  return {
    packFile: outputFile,
    size: packSize,
    manifest,
  }
}

/**
 * Unpack an agent from a tarball
 */
export async function unpackAgent(options: UnpackOptions): Promise<Agent> {
  const { packFile, newAlias, restoreToId = false, targetDirectory } = options

  if (!fs.existsSync(packFile)) {
    throw new Error(`Pack file not found: ${packFile}`)
  }

  // Extract to temporary directory
  const tempDir = path.join(os.tmpdir(), `agent-unpack-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })

  console.log(`[Unpack] Extracting pack: ${packFile}`)
  execSync(`tar -xzf "${packFile}" -C "${tempDir}"`, { stdio: 'inherit' })

  // Find the extracted directory (should be only one)
  const extracted = fs.readdirSync(tempDir)
  if (extracted.length !== 1) {
    throw new Error('Invalid pack structure: expected single root directory')
  }

  const packDir = path.join(tempDir, extracted[0])

  // Read manifest
  const manifestFile = path.join(packDir, 'manifest.json')
  if (!fs.existsSync(manifestFile)) {
    throw new Error('Invalid pack: manifest.json not found')
  }

  const manifest: PackManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'))
  console.log(`[Unpack] Pack version: ${manifest.version}`)
  console.log(`[Unpack] Original agent: ${manifest.agent.alias}`)

  // Read agent metadata
  const agentFile = path.join(packDir, 'agent.json')
  if (!fs.existsSync(agentFile)) {
    throw new Error('Invalid pack: agent.json not found')
  }

  const originalAgent: Agent = JSON.parse(fs.readFileSync(agentFile, 'utf-8'))

  // Determine new agent ID and alias
  const finalAlias = newAlias || `${originalAgent.alias}-clone`
  const finalId = restoreToId ? originalAgent.id : generateNewId()

  console.log(`[Unpack] Restoring as: ${finalAlias} (${finalId})`)

  // Create new agent entry
  const newAgent: Agent = {
    ...originalAgent,
    id: finalId,
    alias: finalAlias,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    status: 'offline',
    tools: {
      ...originalAgent.tools,
      session: originalAgent.tools.session ? {
        ...originalAgent.tools.session,
        status: 'stopped',
        tmuxSessionName: generateSessionName(finalAlias, originalAgent.tags),
      } : undefined
    }
  }

  // Save to registry
  const agents = loadAgents()

  // Check if alias exists
  if (agents.some(a => a.alias === finalAlias)) {
    throw new Error(`Agent with alias "${finalAlias}" already exists`)
  }

  // Check if restoring with same ID
  if (restoreToId && agents.some(a => a.id === finalId)) {
    throw new Error(`Agent with ID "${finalId}" already exists. Use --force to overwrite or omit --restore-to-id for new ID`)
  }

  agents.push(newAgent)
  saveAgents(agents)
  console.log(`[Unpack] ✓ Created agent entry`)

  // Restore database
  if (manifest.includes.database) {
    const sourceDb = path.join(packDir, 'database', 'agent.db')
    if (fs.existsSync(sourceDb)) {
      const targetDbDir = path.join(AGENTS_DIR, finalId)
      fs.mkdirSync(targetDbDir, { recursive: true })
      fs.copyFileSync(sourceDb, path.join(targetDbDir, 'agent.db'))
      console.log(`[Unpack] ✓ Restored database`)
    }
  }

  // Restore messages
  if (manifest.includes.messages && newAgent.tools.session?.tmuxSessionName) {
    const newSessionName = newAgent.tools.session.tmuxSessionName
    const sourceMessages = path.join(packDir, 'messages')

    if (fs.existsSync(sourceMessages)) {
      // Restore inbox
      const sourceInbox = path.join(sourceMessages, 'inbox')
      if (fs.existsSync(sourceInbox)) {
        const targetInbox = path.join(MESSAGES_DIR, 'inbox', newSessionName)
        fs.mkdirSync(targetInbox, { recursive: true })
        copyDirectory(sourceInbox, targetInbox)
        console.log(`[Unpack] ✓ Restored inbox messages`)
      }

      // Restore sent
      const sourceSent = path.join(sourceMessages, 'sent')
      if (fs.existsSync(sourceSent)) {
        const targetSent = path.join(MESSAGES_DIR, 'sent', newSessionName)
        fs.mkdirSync(targetSent, { recursive: true })
        copyDirectory(sourceSent, targetSent)
        console.log(`[Unpack] ✓ Restored sent messages`)
      }
    }
  }

  // Restore workspace
  if (manifest.includes.workspace) {
    const sourceWorkspace = path.join(packDir, 'workspace')
    if (fs.existsSync(sourceWorkspace)) {
      const targetWorkspace = targetDirectory || path.join(os.homedir(), 'aimaestro-workspaces', finalAlias)
      fs.mkdirSync(targetWorkspace, { recursive: true })
      copyDirectory(sourceWorkspace, targetWorkspace)

      // Update agent's working directory
      newAgent.tools.session = {
        ...newAgent.tools.session,
        workingDirectory: targetWorkspace,
      } as any

      saveAgents(agents)
      console.log(`[Unpack] ✓ Restored workspace to: ${targetWorkspace}`)
    }
  }

  // Restore Claude Code skills
  if (manifest.includes.skills) {
    const sourceSkills = path.join(packDir, 'skills')
    if (fs.existsSync(sourceSkills)) {
      const targetSkills = path.join(os.homedir(), '.claude', 'skills')
      fs.mkdirSync(targetSkills, { recursive: true })

      const skillDirs = fs.readdirSync(sourceSkills, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())

      for (const dirent of skillDirs) {
        const skillName = dirent.name
        const sourcePath = path.join(sourceSkills, skillName)
        const targetPath = path.join(targetSkills, skillName)

        // Check if skill already exists
        if (fs.existsSync(targetPath)) {
          console.log(`[Unpack] ⚠ Skill "${skillName}" already exists - skipping`)
          continue
        }

        copyDirectory(sourcePath, targetPath)
        console.log(`[Unpack] ✓ Restored skill: ${skillName}`)
      }

      console.log(`[Unpack] ✓ Restored ${manifest.skills?.length || 0} Claude Code skill(s)`)
    }
  }

  // Cleanup
  fs.rmSync(tempDir, { recursive: true })

  console.log(`[Unpack] ✅ Successfully restored agent: ${finalAlias}`)

  return newAgent
}

/**
 * Inspect a pack file without extracting
 */
export async function inspectPack(packFile: string): Promise<PackManifest> {
  if (!fs.existsSync(packFile)) {
    throw new Error(`Pack file not found: ${packFile}`)
  }

  const tempDir = path.join(os.tmpdir(), `agent-inspect-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    // Extract only manifest
    execSync(`tar -xzf "${packFile}" -C "${tempDir}" --wildcards "*/manifest.json"`, {
      stdio: 'pipe'
    })

    // Find manifest
    const extracted = fs.readdirSync(tempDir)
    const manifestFile = path.join(tempDir, extracted[0], 'manifest.json')

    if (!fs.existsSync(manifestFile)) {
      throw new Error('Invalid pack: manifest.json not found')
    }

    const manifest: PackManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'))
    return manifest
  } finally {
    fs.rmSync(tempDir, { recursive: true })
  }
}

// Helper functions

function copyDirectory(source: string, target: string, exclude: string[] = []) {
  if (!fs.existsSync(source)) {
    return
  }

  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true })
  }

  const entries = fs.readdirSync(source, { withFileTypes: true })

  for (const entry of entries) {
    if (exclude.includes(entry.name)) {
      continue
    }

    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, entry.name)

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath, exclude)
    } else {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

function getFileSize(filePath: string): string {
  const stats = fs.statSync(filePath)
  return formatBytes(stats.size)
}

function getDirectorySize(dirPath: string): number {
  let size = 0

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      size += getDirectorySize(entryPath)
    } else {
      size += fs.statSync(entryPath).size
    }
  }

  return size
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

function generateNewId(): string {
  // Simple UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function generateSessionName(alias: string, tags?: string[]): string {
  const parts = [...(tags || []), alias]
  return parts.map(p => p.toLowerCase().replace(/[^a-z0-9]/g, '')).join('-')
}

#!/usr/bin/env npx tsx
/**
 * Migration Script: Agent Naming Simplification
 *
 * This script migrates existing agents from the old schema to the new agent-first schema:
 * - alias → name
 * - displayName → label (only if different from name)
 * - tools.session → sessions array
 * - workingDirectory promoted to agent level
 *
 * Run with: npx tsx scripts/migrate-agent-names.ts
 * Or: yarn migrate-agents
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const AGENTS_DIR = path.join(AIMAESTRO_DIR, 'agents')
const REGISTRY_FILE = path.join(AGENTS_DIR, 'registry.json')
const BACKUP_FILE = path.join(AGENTS_DIR, `registry.backup.${Date.now()}.json`)

interface OldSessionTool {
  tmuxSessionName: string
  workingDirectory: string
  status: 'running' | 'stopped'
  createdAt: string
  lastActive?: string
}

interface OldAgent {
  id: string
  alias: string
  displayName?: string
  tools: {
    session?: OldSessionTool
    email?: any
    cloud?: any
    repositories?: any[]
  }
  [key: string]: any
}

interface NewAgentSession {
  index: number
  status: 'online' | 'offline'
  workingDirectory?: string
  role?: string
  createdAt?: string
  lastActive?: string
}

interface NewAgent {
  id: string
  name: string
  label?: string
  workingDirectory?: string
  sessions: NewAgentSession[]
  tools: {
    email?: any
    cloud?: any
    repositories?: any[]
  }
  // Keep deprecated fields for one release cycle
  alias?: string
  [key: string]: any
}

/**
 * Parse tmux session name to extract agent name and session index
 */
function parseSessionName(tmuxName: string): { agentName: string; index: number } {
  const match = tmuxName.match(/^(.+)_(\d+)$/)
  if (match) {
    return { agentName: match[1], index: parseInt(match[2], 10) }
  }
  return { agentName: tmuxName, index: 0 }
}

function migrateAgent(oldAgent: OldAgent): NewAgent {
  // Determine the agent name from session name or alias
  let agentName: string
  let sessionIndex = 0

  if (oldAgent.tools?.session?.tmuxSessionName) {
    // Parse the tmux session name to get the canonical agent name
    const parsed = parseSessionName(oldAgent.tools.session.tmuxSessionName)
    agentName = parsed.agentName
    sessionIndex = parsed.index
  } else {
    // Fall back to alias
    agentName = oldAgent.alias
  }

  // Get working directory from session or preferences
  const workingDirectory =
    oldAgent.tools?.session?.workingDirectory ||
    oldAgent.preferences?.defaultWorkingDirectory ||
    undefined

  // Build sessions array
  const sessions: NewAgentSession[] = []
  if (oldAgent.tools?.session) {
    sessions.push({
      index: sessionIndex,
      status: oldAgent.tools.session.status === 'running' ? 'online' : 'offline',
      workingDirectory: oldAgent.tools.session.workingDirectory,
      createdAt: oldAgent.tools.session.createdAt,
      lastActive: oldAgent.tools.session.lastActive,
    })
  }

  // Determine label (only if different from name)
  const label = oldAgent.displayName && oldAgent.displayName !== agentName
    ? oldAgent.displayName
    : undefined

  // Build new agent object
  const newAgent: NewAgent = {
    ...oldAgent,
    // New fields
    name: agentName,
    label,
    workingDirectory,
    sessions,
    // Update tools (remove session, keep others)
    tools: {
      email: oldAgent.tools?.email,
      cloud: oldAgent.tools?.cloud,
      repositories: oldAgent.tools?.repositories,
    },
  }

  // Remove deprecated fields
  delete (newAgent as any).displayName

  return newAgent
}

async function main() {
  console.log('🔄 Agent Naming Migration Script')
  console.log('================================')
  console.log('')

  // Check if registry exists
  if (!fs.existsSync(REGISTRY_FILE)) {
    console.log('❌ Registry file not found:', REGISTRY_FILE)
    console.log('   Nothing to migrate.')
    process.exit(0)
  }

  // Load current registry
  const data = fs.readFileSync(REGISTRY_FILE, 'utf-8')
  const agents: OldAgent[] = JSON.parse(data)

  console.log(`📋 Found ${agents.length} agents in registry`)
  console.log('')

  // Check if already migrated
  const alreadyMigrated = agents.every((a: any) => a.name !== undefined)
  if (alreadyMigrated) {
    console.log('✅ Agents already migrated (all have "name" field)')
    console.log('   Skipping migration.')
    process.exit(0)
  }

  // Create backup
  console.log(`📦 Creating backup: ${BACKUP_FILE}`)
  fs.copyFileSync(REGISTRY_FILE, BACKUP_FILE)

  // Migrate agents
  console.log('')
  console.log('🔄 Migrating agents...')
  console.log('')

  const migratedAgents: NewAgent[] = []

  for (const oldAgent of agents) {
    const newAgent = migrateAgent(oldAgent)
    migratedAgents.push(newAgent)

    const oldName = oldAgent.alias || oldAgent.displayName || oldAgent.id.substring(0, 8)
    const sessionInfo = newAgent.sessions.length > 0
      ? ` (${newAgent.sessions.length} session${newAgent.sessions.length > 1 ? 's' : ''})`
      : ''

    console.log(`   ✓ ${oldName} → ${newAgent.name}${sessionInfo}`)
  }

  // Save migrated registry
  console.log('')
  console.log('💾 Saving migrated registry...')
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(migratedAgents, null, 2), 'utf-8')

  console.log('')
  console.log('✅ Migration complete!')
  console.log('')
  console.log('Summary:')
  console.log(`   - Agents migrated: ${migratedAgents.length}`)
  console.log(`   - Backup created: ${BACKUP_FILE}`)
  console.log('')
  console.log('If you encounter issues, restore from backup:')
  console.log(`   cp "${BACKUP_FILE}" "${REGISTRY_FILE}"`)
  console.log('')
}

main().catch(err => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})

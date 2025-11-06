#!/usr/bin/env node

/**
 * Register agent(s) from current or all tmux sessions
 *
 * Usage:
 *   ./scripts/register-agent-from-session.mjs                    # Register current session (interactive)
 *   ./scripts/register-agent-from-session.mjs --all              # Register all sessions (non-interactive)
 *   ./scripts/register-agent-from-session.mjs --session <name>   # Register specific session
 *   ./scripts/register-agent-from-session.mjs -y                 # Non-interactive mode (use defaults)
 */

import { execSync } from 'child_process'
import * as readline from 'readline'

const API_BASE = 'http://localhost:23000'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function question(query) {
  return new Promise(resolve => rl.question(query, resolve))
}

/**
 * Check if agent exists for session
 */
async function getAgentBySession(sessionName) {
  try {
    const response = await fetch(`${API_BASE}/api/agents`)
    const data = await response.json()
    return data.agents?.find(a => a.currentSession === sessionName) || null
  } catch (error) {
    return null
  }
}

/**
 * Create agent via API
 */
async function createAgentAPI(agentData) {
  const response = await fetch(`${API_BASE}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agentData)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create agent')
  }

  return await response.json()
}

/**
 * Link session to agent via API
 */
async function linkSessionAPI(agentId, sessionName, workingDirectory) {
  const response = await fetch(`${API_BASE}/api/agents/${agentId}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionName,
      workingDirectory
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to link session')
  }

  return await response.json()
}

/**
 * Get current tmux session name
 */
function getCurrentSession() {
  try {
    return execSync('tmux display-message -p "#S"', { encoding: 'utf-8' }).trim()
  } catch (error) {
    return null
  }
}

/**
 * Get all tmux sessions
 */
function getAllSessions() {
  try {
    const output = execSync('tmux list-sessions -F "#{session_name}"', { encoding: 'utf-8' })
    return output.trim().split('\n').filter(Boolean)
  } catch (error) {
    return []
  }
}

/**
 * Get session working directory
 */
function getSessionWorkingDir(sessionName) {
  try {
    return execSync(`tmux display-message -p -t "${sessionName}" -F "#{pane_current_path}"`, {
      encoding: 'utf-8'
    }).trim()
  } catch (error) {
    return process.cwd()
  }
}

/**
 * Parse session name into components
 * Examples:
 *   "23blocks-apps-pronghub" → { tags: ["23blocks"], alias: "apps-pronghub" }
 *   "fluidmind-agents-backend" → { tags: ["fluidmind"], alias: "agents-backend" }
 *   "my-session" → { tags: [], alias: "my-session" }
 *   "single" → { tags: [], alias: "single" }
 */
function parseSessionName(sessionName) {
  const parts = sessionName.split('-').filter(Boolean)

  if (parts.length === 0) {
    return { tags: [], alias: sessionName }
  }

  if (parts.length === 1) {
    return { tags: [], alias: parts[0] }
  }

  if (parts.length === 2) {
    // Two parts: first is tag, second is alias
    return { tags: [parts[0]], alias: parts[1] }
  }

  // Three or more parts: first part is tag, rest form the alias
  const tags = [parts[0]]
  const alias = parts.slice(1).join('-')

  return { tags, alias }
}

/**
 * Register an agent from a session
 */
async function registerSession(sessionName, interactive = true) {
  // Check if already registered
  const existing = await getAgentBySession(sessionName)
  if (existing) {
    console.log(`⚠️  Session "${sessionName}" is already registered as agent "${existing.alias}"`)
    if (interactive) {
      const answer = await question('Do you want to update it? (y/N): ')
      if (answer.toLowerCase() !== 'y') {
        console.log('Skipped.')
        return null
      }
      // TODO: Implement update flow
      console.log('Update not implemented yet. Skipping.')
      return null
    }
    return null
  }

  const workingDir = getSessionWorkingDir(sessionName)
  const parsed = parseSessionName(sessionName)

  console.log(`\n📝 Registering session: ${sessionName}`)
  console.log(`   Working directory: ${workingDir}`)
  console.log(`   Parsed tags: ${parsed.tags.join(', ') || '(none)'}`)
  console.log(`   Parsed alias: ${parsed.alias}`)

  let alias, displayName, taskDescription, tags

  if (interactive) {
    console.log('\n--- Agent Metadata ---')
    alias = await question(`Alias [${parsed.alias}]: `) || parsed.alias
    displayName = await question(`Display Name [${alias}]: `) || alias
    taskDescription = await question('Task Description: ') || 'General-purpose agent'
    const tagsInput = await question(`Tags (comma-separated) [${parsed.tags.join(', ')}]: `)
    tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : parsed.tags
  } else {
    // Non-interactive mode: use defaults
    alias = parsed.alias
    displayName = parsed.alias
    taskDescription = 'General-purpose agent'
    tags = parsed.tags
  }

  try {
    const response = await createAgentAPI({
      alias,
      displayName,
      program: 'claude-code',
      model: 'claude-sonnet-4-5',
      taskDescription,
      tags,
      owner: process.env.USER || 'unknown',
      workingDirectory: workingDir,
      createSession: false, // Don't create session, we're linking existing one
      deploymentType: 'local'
    })

    // The API returns { agent: {...} }, not just the agent
    const agent = response.agent

    // Link the existing session
    await linkSessionAPI(agent.id, sessionName, workingDir)

    console.log(`✅ Agent registered successfully!`)
    console.log(`   ID: ${agent.id}`)
    console.log(`   Alias: ${agent.alias}`)
    console.log(`   Session: ${sessionName}`)

    return agent
  } catch (error) {
    console.error(`❌ Failed to register agent: ${error.message}`)
    return null
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2)
  const isAll = args.includes('--all')
  const nonInteractive = args.includes('-y') || args.includes('--yes') || args.includes('--non-interactive')
  const sessionIndex = args.indexOf('--session')
  const specificSession = sessionIndex !== -1 ? args[sessionIndex + 1] : null

  console.log('🚀 AI Maestro Agent Registration Tool\n')

  let sessions = []

  if (specificSession) {
    sessions = [specificSession]
    console.log(`Registering specific session: ${specificSession}`)
  } else if (isAll) {
    sessions = getAllSessions()
    console.log(`Found ${sessions.length} tmux session(s)`)
  } else {
    const current = getCurrentSession()
    if (!current) {
      console.error('❌ Not in a tmux session. Use --all to register all sessions or --session <name> for a specific session.')
      process.exit(1)
    }
    sessions = [current]
    console.log(`Registering current session: ${current}`)
  }

  if (sessions.length === 0) {
    console.log('No sessions found.')
    process.exit(0)
  }

  const results = []

  for (const sessionName of sessions) {
    const interactive = !nonInteractive && !isAll && sessions.length === 1
    const agent = await registerSession(sessionName, interactive)
    results.push({ sessionName, agent, success: agent !== null })

    if (sessions.length > 1 && agent) {
      // Brief pause between sessions in batch mode
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('Summary:')
  console.log('='.repeat(60))

  const successful = results.filter(r => r.success)
  const skipped = results.filter(r => !r.success)

  console.log(`✅ Registered: ${successful.length}`)
  if (skipped.length > 0) {
    console.log(`⏭️  Skipped: ${skipped.length}`)
    skipped.forEach(r => console.log(`   - ${r.sessionName}`))
  }

  console.log('\n💡 Tip: Use the AI Maestro dashboard to view and manage your agents!')
  console.log('   http://localhost:23000')

  rl.close()
}

main().catch(error => {
  console.error('Fatal error:', error)
  rl.close()
  process.exit(1)
})

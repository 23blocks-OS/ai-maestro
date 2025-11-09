#!/usr/bin/env node

/**
 * Pack an agent for export, cloning, or distribution
 *
 * Usage:
 *   ./scripts/pack-agent.mjs <alias>                              # Pack agent with default options
 *   ./scripts/pack-agent.mjs <alias> --include-workspace          # Include workspace files
 *   ./scripts/pack-agent.mjs <alias> --no-messages                # Exclude messages
 *   ./scripts/pack-agent.mjs <alias> --no-skills                  # Exclude Claude Code skills
 *   ./scripts/pack-agent.mjs <alias> --output /path/to/pack.tar.gz # Custom output path
 *   ./scripts/pack-agent.mjs <alias> --all                        # Include everything
 */

import { execSync } from 'child_process'

const API_BASE = 'http://localhost:23000'

function parseArgs() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: pack-agent.mjs <alias> [options]

Pack an agent for export, cloning, or distribution.

Arguments:
  <alias>                Agent alias to pack

Options:
  --include-workspace    Include workspace files (may be large)
  --no-messages          Exclude messages
  --no-skills            Exclude Claude Code skills
  --output <path>        Custom output path (default: /tmp/agent-pack-{alias}-{timestamp}.tar.gz)
  --all                  Include everything (workspace + messages + skills)
  -h, --help             Show this help message

Examples:
  pack-agent.mjs backend-api
  pack-agent.mjs backend-api --include-workspace
  pack-agent.mjs backend-api --no-skills
  pack-agent.mjs backend-api --output ~/backups/backend-api.tar.gz
  pack-agent.mjs backend-api --all
`)
    process.exit(0)
  }

  const alias = args[0]
  const includeWorkspace = args.includes('--include-workspace') || args.includes('--all')
  const includeMessages = !args.includes('--no-messages')
  const includeSkills = !args.includes('--no-skills')
  const outputIndex = args.indexOf('--output')
  const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : undefined

  return { alias, includeWorkspace, includeMessages, includeSkills, outputPath }
}

async function getAgentByAlias(alias) {
  try {
    const response = await fetch(`${API_BASE}/api/agents?q=${encodeURIComponent(alias)}`)
    const data = await response.json()

    if (!data.agents || data.agents.length === 0) {
      return null
    }

    // Find exact match
    const exact = data.agents.find(a => a.alias.toLowerCase() === alias.toLowerCase())
    return exact || data.agents[0]
  } catch (error) {
    console.error('Failed to fetch agent:', error.message)
    return null
  }
}

async function packAgent(agentId, options) {
  try {
    const response = await fetch(`${API_BASE}/api/agents/${agentId}/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to pack agent')
    }

    return await response.json()
  } catch (error) {
    throw new Error(`Pack failed: ${error.message}`)
  }
}

async function main() {
  const { alias, includeWorkspace, includeMessages, includeSkills, outputPath } = parseArgs()

  console.log('🎒 AI Maestro Agent Pack Tool\n')
  console.log(`Agent: ${alias}`)
  console.log(`Include workspace: ${includeWorkspace ? 'Yes' : 'No'}`)
  console.log(`Include messages: ${includeMessages ? 'Yes' : 'No'}`)
  console.log(`Include skills: ${includeSkills ? 'Yes' : 'No'}`)
  if (outputPath) {
    console.log(`Output path: ${outputPath}`)
  }
  console.log()

  // Find agent
  console.log('🔍 Looking up agent...')
  const agent = await getAgentByAlias(alias)

  if (!agent) {
    console.error(`❌ Agent not found: ${alias}`)
    console.log('\n💡 Tip: Use the dashboard to view all agents: http://localhost:23000')
    process.exit(1)
  }

  console.log(`✓ Found agent: ${agent.displayName || agent.alias} (${agent.id})`)
  console.log()

  // Pack agent
  console.log('📦 Packing agent...')
  console.log()

  const result = await packAgent(agent.id, {
    includeWorkspace,
    includeMessages,
    includeSkills,
    outputPath
  })

  console.log()
  console.log('=' .repeat(70))
  console.log('✅ Pack created successfully!')
  console.log('='.repeat(70))
  console.log()
  console.log(`📦 Pack file: ${result.packFile}`)
  console.log(`📊 Size: ${formatBytes(result.size)}`)
  console.log()
  console.log('Includes:')
  console.log(`  • Agent metadata: ✓`)
  console.log(`  • Database: ${result.manifest.includes.database ? '✓' : '✗'}`)
  console.log(`  • Messages: ${result.manifest.includes.messages ? '✓' : '✗'}`)
  console.log(`  • Claude Code skills: ${result.manifest.includes.skills ? `✓ (${result.manifest.skills?.length || 0})` : '✗'}`)
  console.log(`  • Workspace: ${result.manifest.includes.workspace ? '✓' : '✗'}`)
  console.log()
  console.log('💡 Next steps:')
  console.log(`   • Copy to another machine: scp ${result.packFile} user@host:~/`)
  console.log(`   • Unpack: ./scripts/unpack-agent.mjs ${result.packFile}`)
  console.log(`   • Clone locally: ./scripts/unpack-agent.mjs ${result.packFile} --alias ${alias}-clone`)
  console.log()
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

main().catch(error => {
  console.error('\n❌ Error:', error.message)
  process.exit(1)
})

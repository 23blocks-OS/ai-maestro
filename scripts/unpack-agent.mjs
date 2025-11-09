#!/usr/bin/env node

/**
 * Unpack and restore an agent from a pack file
 *
 * Usage:
 *   ./scripts/unpack-agent.mjs <pack-file>                        # Restore with auto-generated alias
 *   ./scripts/unpack-agent.mjs <pack-file> --alias new-agent      # Restore with specific alias
 *   ./scripts/unpack-agent.mjs <pack-file> --inspect              # Inspect without restoring
 *   ./scripts/unpack-agent.mjs <pack-file> --restore-id           # Restore with original ID (dangerous!)
 *   ./scripts/unpack-agent.mjs <pack-file> --workspace ~/projects # Custom workspace location
 */

import fs from 'fs'
import path from 'path'
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

function parseArgs() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: unpack-agent.mjs <pack-file> [options]

Unpack and restore an agent from a pack file.

Arguments:
  <pack-file>            Path to .tar.gz pack file

Options:
  --alias <name>         Restore with specific alias (default: {original}-clone)
  --inspect              Inspect pack contents without restoring
  --restore-id           Restore with original agent ID (use with caution!)
  --workspace <path>     Custom workspace directory (default: ~/aimaestro-workspaces/{alias})
  -y, --yes              Skip confirmation prompts
  -h, --help             Show this help message

Examples:
  unpack-agent.mjs agent-pack-backend-api-1234567890.tar.gz
  unpack-agent.mjs pack.tar.gz --alias backend-api-dev
  unpack-agent.mjs pack.tar.gz --inspect
  unpack-agent.mjs pack.tar.gz --restore-id --yes
`)
    process.exit(0)
  }

  const packFile = args[0]
  const aliasIndex = args.indexOf('--alias')
  const workspaceIndex = args.indexOf('--workspace')
  const newAlias = aliasIndex !== -1 ? args[aliasIndex + 1] : undefined
  const targetDirectory = workspaceIndex !== -1 ? args[workspaceIndex + 1] : undefined
  const inspect = args.includes('--inspect')
  const restoreToId = args.includes('--restore-id')
  const skipConfirm = args.includes('-y') || args.includes('--yes')

  return { packFile, newAlias, targetDirectory, inspect, restoreToId, skipConfirm }
}

async function inspectPackLocal(packFile) {
  // Extract manifest locally
  const tempDir = `/tmp/agent-inspect-${Date.now()}`
  execSync(`mkdir -p "${tempDir}"`, { stdio: 'pipe' })

  try {
    execSync(`tar -xzf "${packFile}" -C "${tempDir}" --wildcards "*/manifest.json"`, {
      stdio: 'pipe'
    })

    const extracted = fs.readdirSync(tempDir)
    const manifestFile = path.join(tempDir, extracted[0], 'manifest.json')

    if (!fs.existsSync(manifestFile)) {
      throw new Error('Invalid pack: manifest.json not found')
    }

    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'))
    return manifest
  } finally {
    execSync(`rm -rf "${tempDir}"`, { stdio: 'pipe' })
  }
}

async function unpackAgentViaAPI(packFile, options) {
  try {
    // Create form data
    const formData = new FormData()
    const fileContent = fs.readFileSync(packFile)
    const blob = new Blob([fileContent], { type: 'application/gzip' })
    formData.append('file', blob, path.basename(packFile))

    if (options.newAlias) {
      formData.append('newAlias', options.newAlias)
    }
    if (options.restoreToId) {
      formData.append('restoreToId', 'true')
    }
    if (options.targetDirectory) {
      formData.append('targetDirectory', options.targetDirectory)
    }

    const response = await fetch(`${API_BASE}/api/agents/unpack`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to unpack agent')
    }

    return await response.json()
  } catch (error) {
    throw new Error(`Unpack failed: ${error.message}`)
  }
}

async function main() {
  const { packFile, newAlias, targetDirectory, inspect, restoreToId, skipConfirm } = parseArgs()

  console.log('📦 AI Maestro Agent Unpack Tool\n')

  // Verify pack file exists
  if (!fs.existsSync(packFile)) {
    console.error(`❌ Pack file not found: ${packFile}`)
    process.exit(1)
  }

  console.log(`Pack file: ${packFile}`)
  console.log(`Size: ${formatBytes(fs.statSync(packFile).size)}`)
  console.log()

  // Inspect pack
  console.log('🔍 Inspecting pack...')
  const manifest = await inspectPackLocal(packFile)

  console.log()
  console.log('='.repeat(70))
  console.log('Pack Information')
  console.log('='.repeat(70))
  console.log()
  console.log(`Original Agent:`)
  console.log(`  • ID: ${manifest.agent.id}`)
  console.log(`  • Alias: ${manifest.agent.alias}`)
  console.log(`  • Display Name: ${manifest.agent.displayName}`)
  console.log()
  console.log(`Pack Details:`)
  console.log(`  • Version: ${manifest.version}`)
  console.log(`  • Created: ${new Date(manifest.packDate).toLocaleString()}`)
  console.log()
  console.log(`Includes:`)
  console.log(`  • Database: ${manifest.includes.database ? '✓' : '✗'}`)
  console.log(`  • Messages: ${manifest.includes.messages ? '✓' : '✗'}`)
  console.log(`  • Workspace: ${manifest.includes.workspace ? '✓' : '✗'}`)
  if (manifest.workspace) {
    console.log(`    - Original path: ${manifest.workspace.path}`)
    console.log(`    - Size: ${formatBytes(manifest.workspace.size)}`)
  }
  console.log()

  // If just inspecting, exit here
  if (inspect) {
    console.log('✓ Inspection complete')
    rl.close()
    process.exit(0)
  }

  // Determine final alias
  const finalAlias = newAlias || `${manifest.agent.alias}-clone`
  console.log(`Restore Configuration:`)
  console.log(`  • New alias: ${finalAlias}`)
  console.log(`  • Restore with original ID: ${restoreToId ? 'Yes (⚠️  may conflict)' : 'No (safe, new ID)'}`)
  if (targetDirectory) {
    console.log(`  • Workspace location: ${targetDirectory}`)
  }
  console.log()

  // Confirm
  if (!skipConfirm) {
    const answer = await question('Proceed with restore? (y/N): ')
    if (answer.toLowerCase() !== 'y') {
      console.log('Cancelled.')
      rl.close()
      process.exit(0)
    }
    console.log()
  }

  // Unpack
  console.log('📤 Unpacking agent...')
  console.log()

  const result = await unpackAgentViaAPI(packFile, {
    newAlias: newAlias || finalAlias,
    restoreToId,
    targetDirectory
  })

  console.log()
  console.log('='.repeat(70))
  console.log('✅ Agent restored successfully!')
  console.log('='.repeat(70))
  console.log()
  console.log(`Agent:`)
  console.log(`  • ID: ${result.agent.id}`)
  console.log(`  • Alias: ${result.agent.alias}`)
  console.log(`  • Display Name: ${result.agent.displayName}`)
  console.log()
  console.log('💡 Next steps:')
  console.log(`   • View in dashboard: http://localhost:23000`)
  console.log(`   • Create tmux session: tmux new-session -s <session-name>`)
  console.log(`   • Link session: ./scripts/register-agent-from-session.mjs --session <session-name>`)
  console.log()

  rl.close()
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
  rl.close()
  process.exit(1)
})

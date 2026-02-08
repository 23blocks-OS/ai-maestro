#!/usr/bin/env node

/**
 * Migrate AMP agent directories from name-keyed to UUID-keyed
 *
 * Converts existing name-based directories to UUID-based with name symlinks:
 *   ~/.agent-messaging/agents/<name>/  ->  ~/.agent-messaging/agents/<uuid>/
 *   + symlink: <name> -> <uuid>
 *
 * Usage:
 *   node scripts/migrate-amp-to-uuid.mjs              # Dry run (show what would change)
 *   node scripts/migrate-amp-to-uuid.mjs --apply      # Apply migration
 *   node scripts/migrate-amp-to-uuid.mjs --verbose     # Show detailed output
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

const AMP_AGENTS_DIR = path.join(os.homedir(), '.agent-messaging', 'agents')
const REGISTRY_FILE = path.join(os.homedir(), '.aimaestro', 'agents', 'registry.json')

const args = process.argv.slice(2)
const dryRun = !args.includes('--apply')
const verbose = args.includes('--verbose')

// UUID v4 pattern
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function log(msg) {
  console.log(msg)
}

function vlog(msg) {
  if (verbose) console.log(`  ${msg}`)
}

function loadRegistry() {
  try {
    const data = fs.readFileSync(REGISTRY_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    console.error(`Error: Cannot read registry at ${REGISTRY_FILE}`)
    process.exit(1)
  }
}

function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

function main() {
  log(`AMP Directory Migration: Name -> UUID`)
  log(`======================================`)
  log(``)

  if (dryRun) {
    log(`Mode: DRY RUN (use --apply to execute)`)
  } else {
    log(`Mode: APPLYING CHANGES`)
  }
  log(``)

  // Check AMP agents dir exists
  if (!fs.existsSync(AMP_AGENTS_DIR)) {
    log(`No AMP agents directory found at ${AMP_AGENTS_DIR}`)
    log(`Nothing to migrate.`)
    return
  }

  // Load agent registry
  const agents = loadRegistry()
  log(`Registry: ${agents.length} agents`)

  // Build name -> agent lookup
  // Match any agent by name — AMP dirs on this machine belong to agents on this machine
  const nameToAgent = new Map()
  for (const agent of agents) {
    const name = agent.name || agent.alias
    if (name && agent.id) {
      // If multiple agents share a name, first match wins (shouldn't happen)
      if (!nameToAgent.has(name)) {
        nameToAgent.set(name, agent)
      }
    }
  }
  log(`Agents with names: ${nameToAgent.size}`)
  log(``)

  // Scan AMP agents directory
  const entries = fs.readdirSync(AMP_AGENTS_DIR)
  let migrated = 0
  let skipped = 0
  let alreadyMigrated = 0
  let orphaned = 0

  for (const entry of entries) {
    const fullPath = path.join(AMP_AGENTS_DIR, entry)

    // Skip symlinks (already migrated name -> uuid)
    if (isSymlink(fullPath)) {
      alreadyMigrated++
      vlog(`SKIP (symlink): ${entry} -> ${fs.readlinkSync(fullPath)}`)
      continue
    }

    // Skip if it looks like a UUID (already correct)
    if (UUID_PATTERN.test(entry)) {
      alreadyMigrated++
      vlog(`SKIP (uuid dir): ${entry}`)
      continue
    }

    // It's a name-keyed directory — look up the agent
    const agent = nameToAgent.get(entry)
    if (!agent) {
      orphaned++
      log(`  WARN: Orphaned directory "${entry}" — no matching agent in registry`)
      continue
    }

    const agentId = agent.id
    const uuidDir = path.join(AMP_AGENTS_DIR, agentId)

    // Check if UUID dir already exists (edge case: partial migration)
    if (fs.existsSync(uuidDir)) {
      log(`  WARN: UUID dir already exists for "${entry}" (${agentId}) — skipping`)
      skipped++
      continue
    }

    log(`  MIGRATE: ${entry} -> ${agentId}`)

    if (!dryRun) {
      try {
        // 1. Rename directory: name -> uuid
        fs.renameSync(fullPath, uuidDir)

        // 2. Create symlink: name -> uuid
        fs.symlinkSync(agentId, fullPath)

        // 3. Update config.json with agent.id
        const configPath = path.join(uuidDir, 'config.json')
        if (fs.existsSync(configPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
            config.agent = config.agent || {}
            config.agent.id = agentId
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
          } catch (e) {
            log(`    WARN: Could not update config.json: ${e.message}`)
          }
        }

        log(`    OK: Migrated and symlinked`)
        migrated++
      } catch (e) {
        log(`    ERROR: ${e.message}`)
        skipped++
      }
    } else {
      migrated++
    }
  }

  log(``)
  log(`Summary:`)
  log(`  Migrated:         ${migrated}${dryRun ? ' (would be)' : ''}`)
  log(`  Already migrated: ${alreadyMigrated}`)
  log(`  Skipped:          ${skipped}`)
  log(`  Orphaned:         ${orphaned}`)

  if (dryRun && migrated > 0) {
    log(``)
    log(`Run with --apply to execute the migration.`)
  }
}

main()

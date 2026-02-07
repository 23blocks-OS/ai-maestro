#!/usr/bin/env node

/**
 * Setup per-agent AMP directories and migrate existing messages.
 *
 * This script:
 * 1. Discovers all registered agents (not just running ones)
 * 2. Creates per-agent AMP directories (~/.agent-messaging/agents/<name>/)
 * 3. Migrates messages from shared AMP inbox to per-agent inboxes
 * 4. Migrates messages from old system (~/.aimaestro/messages/) to per-agent AMP
 * 5. Sets AMP_DIR environment variable in running tmux sessions
 * 6. Copies machine-level config/keys/registrations to each agent
 *
 * NO DATA IS DELETED. All migrations are copies, originals stay intact.
 *
 * Usage:
 *   node scripts/setup-agent-amp.mjs
 *   node scripts/setup-agent-amp.mjs --dry-run
 */

import { execSync } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

const HOME = os.homedir()
const AMP_DIR = path.join(HOME, '.agent-messaging')
const AMP_AGENTS_DIR = path.join(AMP_DIR, 'agents')
const AMP_SHARED_INBOX = path.join(AMP_DIR, 'messages', 'inbox')
const AMP_SHARED_SENT = path.join(AMP_DIR, 'messages', 'sent')
const OLD_MESSAGES_DIR = path.join(HOME, '.aimaestro', 'messages')
const AGENT_REGISTRY = path.join(HOME, '.aimaestro', 'agents', 'registry.json')
const DRY_RUN = process.argv.includes('--dry-run')

function sanitizeAddressForPath(address) {
  return address.replace(/[@.]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * Read a JSON file safely
 */
async function readJSON(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Recursively find all .json files in a directory
 */
async function findJSONFiles(dir) {
  const results = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...await findJSONFiles(fullPath))
      } else if (entry.name.endsWith('.json')) {
        results.push(fullPath)
      }
    }
  } catch { /* dir doesn't exist */ }
  return results
}

/**
 * Migrate messages from the shared AMP inbox to per-agent inboxes.
 * Reads envelope.to from each message to determine the recipient agent.
 */
async function migrateSharedAMPInbox(agentIdToName) {
  console.log('--- Migrating shared AMP inbox ---')

  const messageFiles = await findJSONFiles(AMP_SHARED_INBOX)
  if (messageFiles.length === 0) {
    console.log('  No messages in shared AMP inbox')
    return { migrated: 0, skipped: 0, errors: 0 }
  }

  console.log(`  Found ${messageFiles.length} message(s) in shared inbox`)

  let migrated = 0, skipped = 0, errors = 0

  for (const filePath of messageFiles) {
    try {
      const msg = await readJSON(filePath)
      if (!msg) { errors++; continue }

      // Handle both AMP envelope format and old flat format
      let toAddress, fromAddress, recipientAgent

      if (msg.envelope && msg.envelope.to) {
        // AMP envelope format: { envelope: { to: "agent@host.local", from: "..." } }
        toAddress = msg.envelope.to
        fromAddress = msg.envelope.from || 'unknown'
      } else if (msg.to || msg.toAlias) {
        // Old flat format: { to: "agentId", toAlias: "agentName", from: "agentId", fromAlias: "agentName" }
        // IMPORTANT: Use toAlias (agent name) first, to is often a UUID
        toAddress = msg.toAlias || msg.to
        fromAddress = msg.fromAlias || msg.from || 'unknown'
      } else {
        skipped++
        continue
      }

      // Extract agent name: "agent@host.local" -> "agent", or plain name stays as-is
      const atIndex = toAddress.indexOf('@')
      recipientAgent = atIndex > 0 ? toAddress.substring(0, atIndex) : toAddress

      // If recipientAgent looks like a UUID, try to resolve it to a name
      if (recipientAgent.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/)) {
        const resolvedName = agentIdToName[recipientAgent]
        if (resolvedName) {
          recipientAgent = resolvedName
        }
        // If we can't resolve, still use the UUID - better than losing the message
      }

      if (!recipientAgent) {
        skipped++
        continue
      }

      // Resolve sender UUID to name too
      let senderName = fromAddress
      if (senderName.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/)) {
        senderName = agentIdToName[senderName] || senderName
      }

      // Determine sender dir (matches AMP convention)
      const senderDir = sanitizeAddressForPath(senderName)

      // Convert message to AMP envelope format if it's in old format
      let messageToWrite
      if (msg.envelope) {
        messageToWrite = msg // Already in AMP format
      } else {
        // Convert old format to AMP envelope
        const msgId = (msg.id || path.basename(filePath, '.json')).replace(/-/g, '_')
        messageToWrite = {
          envelope: {
            version: 'amp/0.1',
            id: msgId,
            from: senderName.includes('@') ? senderName : `${senderName}@local`,
            to: recipientAgent.includes('@') ? recipientAgent : `${recipientAgent}@local`,
            subject: msg.subject || '(no subject)',
            priority: msg.priority || 'normal',
            timestamp: msg.timestamp || new Date().toISOString(),
            thread_id: msg.inReplyTo ? msg.inReplyTo.replace(/-/g, '_') : msgId,
            in_reply_to: msg.inReplyTo ? msg.inReplyTo.replace(/-/g, '_') : null,
            expires_at: null,
            signature: null
          },
          payload: {
            type: msg.content?.type || 'text',
            message: msg.content?.message || msg.content || '',
            context: msg.content?.context || null
          },
          metadata: {
            status: msg.status || 'unread',
            queued_at: msg.timestamp,
            delivery_attempts: 1
          },
          local: {
            received_at: msg.timestamp || new Date().toISOString(),
            delivery_method: 'migrated_from_shared',
            status: msg.status || 'unread',
            original_id: msg.id
          }
        }
      }

      // Use AMP-compatible filename
      const fileName = msg.envelope
        ? path.basename(filePath)
        : `${(msg.id || path.basename(filePath, '.json')).replace(/-/g, '_')}.json`

      const destDir = path.join(AMP_AGENTS_DIR, recipientAgent, 'messages', 'inbox', senderDir)
      const destFile = path.join(destDir, fileName)

      // Check if already migrated
      try {
        await fs.access(destFile)
        skipped++
        continue
      } catch { /* doesn't exist, proceed */ }

      if (!DRY_RUN) {
        await fs.mkdir(destDir, { recursive: true })
        await fs.writeFile(destFile, JSON.stringify(messageToWrite, null, 2))
      }

      migrated++
    } catch (err) {
      console.error(`  Error processing ${filePath}:`, err.message)
      errors++
    }
  }

  // Also migrate shared sent
  const sentFiles = await findJSONFiles(AMP_SHARED_SENT)
  if (sentFiles.length > 0) {
    console.log(`  Found ${sentFiles.length} message(s) in shared sent`)

    for (const filePath of sentFiles) {
      try {
        const msg = await readJSON(filePath)
        if (!msg || !msg.envelope) continue

        const fromAddress = msg.envelope.from || ''
        const atIndex = fromAddress.indexOf('@')
        const senderAgent = atIndex > 0 ? fromAddress.substring(0, atIndex) : null
        if (!senderAgent) continue

        const recipientDir = sanitizeAddressForPath(msg.envelope.to || 'unknown')
        const destDir = path.join(AMP_AGENTS_DIR, senderAgent, 'messages', 'sent', recipientDir)
        const destFile = path.join(destDir, path.basename(filePath))

        try { await fs.access(destFile); continue } catch { /* proceed */ }

        if (!DRY_RUN) {
          await fs.mkdir(destDir, { recursive: true })
          await fs.copyFile(filePath, destFile)
        }
        migrated++
      } catch { errors++ }
    }
  }

  return { migrated, skipped, errors }
}

/**
 * Migrate messages from old system (~/.aimaestro/messages/) to per-agent AMP dirs.
 * Old system is already per-agent: ~/.aimaestro/messages/inbox/<agentId>/
 * We need to map agentId -> agentName using the registry.
 */
async function migrateOldMessages(agentIdToName) {
  console.log('--- Migrating old system messages ---')

  const oldInbox = path.join(OLD_MESSAGES_DIR, 'inbox')
  let migrated = 0, skipped = 0, errors = 0

  try {
    const agentDirs = await fs.readdir(oldInbox, { withFileTypes: true })

    for (const entry of agentDirs) {
      if (!entry.isDirectory()) continue

      const agentId = entry.name
      const agentName = agentIdToName[agentId]

      if (!agentName) {
        console.log(`  Skipping ${agentId}: no agent name mapping found`)
        skipped++
        continue
      }

      const messageFiles = await findJSONFiles(path.join(oldInbox, agentId))
      if (messageFiles.length === 0) continue

      console.log(`  ${agentName} (${agentId}): ${messageFiles.length} message(s)`)

      for (const filePath of messageFiles) {
        try {
          const msg = await readJSON(filePath)
          if (!msg) { errors++; continue }

          // Old format: { from, to, subject, content, ... }
          // Convert to AMP envelope format
          const fromName = msg.fromAlias || msg.from || 'unknown'
          const senderDir = sanitizeAddressForPath(fromName)

          // Convert message ID from old format (msg-xxx) to AMP format (msg_xxx)
          const msgId = (msg.id || path.basename(filePath, '.json')).replace(/-/g, '_')
          const destDir = path.join(AMP_AGENTS_DIR, agentName, 'messages', 'inbox', senderDir)
          const destFile = path.join(destDir, `${msgId}.json`)

          try { await fs.access(destFile); skipped++; continue } catch { /* proceed */ }

          // Convert to AMP envelope format
          const ampMessage = {
            envelope: {
              version: 'amp/0.1',
              id: msgId,
              from: `${fromName}@local`,
              to: `${agentName}@local`,
              subject: msg.subject || '(no subject)',
              priority: msg.priority || 'normal',
              timestamp: msg.timestamp || msg.createdAt || new Date().toISOString(),
              thread_id: msg.inReplyTo ? msg.inReplyTo.replace(/-/g, '_') : msgId,
              in_reply_to: msg.inReplyTo ? msg.inReplyTo.replace(/-/g, '_') : null,
              expires_at: null,
              signature: null
            },
            payload: {
              type: msg.content?.type || 'text',
              message: msg.content?.message || msg.content || '',
              context: msg.content?.context || null
            },
            metadata: {
              status: msg.status || 'read',
              queued_at: msg.timestamp || msg.createdAt,
              delivery_attempts: 1
            },
            local: {
              received_at: msg.timestamp || msg.createdAt || new Date().toISOString(),
              delivery_method: 'migrated_from_old',
              status: msg.status || 'read',
              original_id: msg.id
            }
          }

          if (!DRY_RUN) {
            await fs.mkdir(destDir, { recursive: true })
            await fs.writeFile(destFile, JSON.stringify(ampMessage, null, 2))
          }
          migrated++
        } catch (err) {
          errors++
        }
      }
    }
  } catch {
    console.log('  No old message directory found')
  }

  // Also migrate old sent messages
  const oldSent = path.join(OLD_MESSAGES_DIR, 'sent')
  try {
    const agentDirs = await fs.readdir(oldSent, { withFileTypes: true })
    for (const entry of agentDirs) {
      if (!entry.isDirectory()) continue
      const agentId = entry.name
      const agentName = agentIdToName[agentId]
      if (!agentName) continue

      const messageFiles = await findJSONFiles(path.join(oldSent, agentId))
      for (const filePath of messageFiles) {
        try {
          const msg = await readJSON(filePath)
          if (!msg) continue

          const toName = msg.toAlias || msg.to || 'unknown'
          const recipientDir = sanitizeAddressForPath(toName)
          const msgId = (msg.id || path.basename(filePath, '.json')).replace(/-/g, '_')
          const destDir = path.join(AMP_AGENTS_DIR, agentName, 'messages', 'sent', recipientDir)
          const destFile = path.join(destDir, `${msgId}.json`)

          try { await fs.access(destFile); continue } catch { /* proceed */ }

          const ampMessage = {
            envelope: {
              version: 'amp/0.1',
              id: msgId,
              from: `${agentName}@local`,
              to: `${toName}@local`,
              subject: msg.subject || '(no subject)',
              priority: msg.priority || 'normal',
              timestamp: msg.timestamp || msg.createdAt || new Date().toISOString(),
              thread_id: msgId,
              in_reply_to: null,
              expires_at: null,
              signature: null
            },
            payload: {
              type: msg.content?.type || 'text',
              message: msg.content?.message || msg.content || '',
              context: msg.content?.context || null
            },
            local: {
              sent_at: msg.timestamp || msg.createdAt || new Date().toISOString(),
              original_id: msg.id
            }
          }

          if (!DRY_RUN) {
            await fs.mkdir(destDir, { recursive: true })
            await fs.writeFile(destFile, JSON.stringify(ampMessage, null, 2))
          }
          migrated++
        } catch { errors++ }
      }
    }
  } catch { /* no old sent */ }

  return { migrated, skipped, errors }
}

async function main() {
  console.log('=== AMP Per-Agent Setup & Message Migration ===')
  if (DRY_RUN) console.log('(DRY RUN - no changes will be made)')
  console.log()

  // Load agent registry to map IDs to names
  const registry = await readJSON(AGENT_REGISTRY)
  const agents = registry?.agents || registry || []
  const agentList = Array.isArray(agents) ? agents : []

  const agentIdToName = {}
  const allAgentNames = new Set()

  for (const agent of agentList) {
    const name = agent.name || agent.alias
    if (name && agent.id) {
      agentIdToName[agent.id] = name
      allAgentNames.add(name)
    }
  }

  console.log(`Found ${allAgentNames.size} agent(s) in registry`)
  console.log()

  // Load machine config, keys, registrations for copying
  let machineConfig = null
  let machineKeys = { private: null, public: null }
  let machineRegistrations = []

  try {
    machineConfig = await readJSON(path.join(AMP_DIR, 'config.json'))
  } catch { /* no machine config */ }

  try {
    machineKeys.private = await fs.readFile(path.join(AMP_DIR, 'keys', 'private.pem'))
    machineKeys.public = await fs.readFile(path.join(AMP_DIR, 'keys', 'public.pem'))
  } catch { /* no machine keys */ }

  try {
    const regsDir = path.join(AMP_DIR, 'registrations')
    const files = await fs.readdir(regsDir)
    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = await readJSON(path.join(regsDir, file))
        if (data) machineRegistrations.push({ file, data })
      }
    }
  } catch { /* no registrations */ }

  // Step 1: Create per-agent AMP directories
  console.log('--- Setting up per-agent AMP directories ---')

  for (const agentName of allAgentNames) {
    const agentHome = path.join(AMP_AGENTS_DIR, agentName)
    console.log(`  ${agentName}: ${agentHome}`)

    if (!DRY_RUN) {
      await fs.mkdir(path.join(agentHome, 'messages', 'inbox'), { recursive: true })
      await fs.mkdir(path.join(agentHome, 'messages', 'sent'), { recursive: true })
      await fs.mkdir(path.join(agentHome, 'keys'), { recursive: true })
      await fs.mkdir(path.join(agentHome, 'registrations'), { recursive: true })

      // Copy config
      if (machineConfig) {
        const configPath = path.join(agentHome, 'config.json')
        try { await fs.access(configPath) } catch {
          const agentConfig = { ...machineConfig, agent: { ...machineConfig.agent, name: agentName } }
          await fs.writeFile(configPath, JSON.stringify(agentConfig, null, 2))
        }
      }

      // Copy keys
      if (machineKeys.private && machineKeys.public) {
        try { await fs.access(path.join(agentHome, 'keys', 'private.pem')) } catch {
          await fs.writeFile(path.join(agentHome, 'keys', 'private.pem'), machineKeys.private)
          await fs.writeFile(path.join(agentHome, 'keys', 'public.pem'), machineKeys.public)
        }
      }

      // Copy registrations with agent-specific address
      for (const reg of machineRegistrations) {
        const destPath = path.join(agentHome, 'registrations', reg.file)
        try { await fs.access(destPath) } catch {
          const regData = { ...reg.data }
          if (regData.address) {
            const parts = regData.address.split('@')
            if (parts.length === 2) regData.address = `${agentName}@${parts[1]}`
          }
          await fs.writeFile(destPath, JSON.stringify(regData, null, 2))
        }
      }
    }
  }

  console.log()

  // Step 2: Migrate shared AMP inbox to per-agent
  const ampResult = await migrateSharedAMPInbox()
  console.log(`  Migrated: ${ampResult.migrated}, Skipped: ${ampResult.skipped}, Errors: ${ampResult.errors}`)
  console.log()

  // Step 3: Migrate old system messages to per-agent AMP
  const oldResult = await migrateOldMessages(agentIdToName)
  console.log(`  Migrated: ${oldResult.migrated}, Skipped: ${oldResult.skipped}, Errors: ${oldResult.errors}`)
  console.log()

  // Step 4: Set AMP_DIR in running tmux sessions
  console.log('--- Setting AMP_DIR in running tmux sessions ---')

  let tmuxCount = 0
  try {
    const res = await fetch('http://localhost:23000/api/sessions')
    const data = await res.json()
    const sessions = data.sessions || []

    for (const session of sessions) {
      const agentName = session.agentName || session.name
      if (!agentName || !allAgentNames.has(agentName)) continue

      const agentHome = path.join(AMP_AGENTS_DIR, agentName)
      const tmuxSession = session.id || session.name

      if (!DRY_RUN) {
        try {
          execSync(`tmux set-environment -t "${tmuxSession}" AMP_DIR "${agentHome}" 2>/dev/null`)
          console.log(`  ${agentName}: AMP_DIR set`)
          tmuxCount++
        } catch {
          console.log(`  ${agentName}: tmux session not found`)
        }
      } else {
        console.log(`  ${agentName}: would set AMP_DIR=${agentHome}`)
        tmuxCount++
      }
    }
  } catch {
    console.log('  AI Maestro not running, skipping tmux setup')
  }

  // Summary
  console.log()
  console.log('=== Summary ===')
  console.log(`Agents: ${allAgentNames.size}`)
  console.log(`Shared AMP messages migrated: ${ampResult.migrated}`)
  console.log(`Old system messages migrated: ${oldResult.migrated}`)
  console.log(`Tmux sessions updated: ${tmuxCount}`)
  console.log()

  const totalMigrated = ampResult.migrated + oldResult.migrated
  if (totalMigrated > 0 || !DRY_RUN) {
    console.log('All original messages are preserved (nothing deleted).')
    console.log('New sessions will have AMP_DIR set automatically on wake/create.')
  }

  if (DRY_RUN) {
    console.log()
    console.log('Run without --dry-run to apply changes.')
  }
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})

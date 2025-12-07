#!/usr/bin/env node
/**
 * Migrate all agent databases to the latest schema
 *
 * This script ensures all agent databases have the correct columns:
 * - conversations: last_indexed_at, last_indexed_message_count
 * - components: class_type
 *
 * CozoDB doesn't support ALTER TABLE, so we must:
 * 1. Backup existing data
 * 2. Drop the table
 * 3. Create with new schema
 * 4. Restore data
 */

import fs from 'fs'
import path from 'path'
import { CozoDb } from 'cozo-node'

const AGENTS_DIR = path.join(process.env.HOME, '.aimaestro', 'agents')

async function migrateDatabase(agentId, dbPath) {
  console.log(`\n[${agentId}] Opening database...`)

  // CozoDB constructor takes (engine, path) - use 'sqlite' engine
  const db = new CozoDb('sqlite', dbPath)

  let migratedConversations = false
  let migratedComponents = false

  try {
    // =========================================================================
    // MIGRATE CONVERSATIONS TABLE
    // =========================================================================
    try {
      // Check if last_indexed_at column exists by trying to query it
      await db.run(`?[last_indexed_at] := *conversations{last_indexed_at} :limit 1`)
      console.log(`[${agentId}] conversations table OK (has last_indexed_at)`)
    } catch (error) {
      if (error.message?.includes('last_indexed_at') ||
          error.code === 'eval::required_col_not_found' ||
          error.code === 'eval::named_field_not_found') {
        console.log(`[${agentId}] conversations table needs migration (missing last_indexed_at)`)

        // Get existing data with old schema
        let existingData = []
        try {
          const result = await db.run(`
            ?[jsonl_file, project_path, session_id, first_message_at, last_message_at,
              message_count, first_user_message, model_names, git_branch, claude_version] :=
            *conversations{jsonl_file, project_path, session_id, first_message_at, last_message_at,
              message_count, first_user_message, model_names, git_branch, claude_version}
          `)
          existingData = result.rows || []
          console.log(`[${agentId}]   Found ${existingData.length} existing conversations`)
        } catch (e) {
          // Table might not exist at all
          console.log(`[${agentId}]   No existing conversations found`)
        }

        // Drop old table
        try {
          await db.run(`::remove conversations`)
          console.log(`[${agentId}]   Dropped old conversations table`)
        } catch (e) {
          // Table might not exist
        }

        // Create new table with all columns
        await db.run(`
          :create conversations {
            jsonl_file: String
            =>
            project_path: String,
            session_id: String?,
            first_message_at: Int?,
            last_message_at: Int?,
            message_count: Int,
            first_user_message: String?,
            model_names: String?,
            git_branch: String?,
            claude_version: String?,
            last_indexed_at: Int?,
            last_indexed_message_count: Int?
          }
        `)
        console.log(`[${agentId}]   Created new conversations table with all columns`)

        // Restore data
        for (const row of existingData) {
          const escapeStr = (s) => s ? `'${String(s).replace(/'/g, "''").replace(/\\/g, '\\\\')}'` : 'null'
          await db.run(`
            ?[jsonl_file, project_path, session_id, first_message_at, last_message_at,
              message_count, first_user_message, model_names, git_branch, claude_version,
              last_indexed_at, last_indexed_message_count] <- [[
              ${escapeStr(row[0])},
              ${escapeStr(row[1])},
              ${row[2] ? escapeStr(row[2]) : 'null'},
              ${row[3] || 'null'},
              ${row[4] || 'null'},
              ${row[5] || 0},
              ${row[6] ? escapeStr(row[6]) : 'null'},
              ${row[7] ? escapeStr(row[7]) : 'null'},
              ${row[8] ? escapeStr(row[8]) : 'null'},
              ${row[9] ? escapeStr(row[9]) : 'null'},
              null,
              0
            ]]
            :put conversations
          `)
        }

        if (existingData.length > 0) {
          console.log(`[${agentId}]   Restored ${existingData.length} conversations`)
        }

        migratedConversations = true
        console.log(`[${agentId}] ✓ conversations table migrated`)
      } else {
        throw error
      }
    }

    // =========================================================================
    // MIGRATE COMPONENTS TABLE
    // =========================================================================
    try {
      // Check if class_type column exists
      await db.run(`?[class_type] := *components{class_type} :limit 1`)
      console.log(`[${agentId}] components table OK (has class_type)`)
    } catch (error) {
      if (error.message?.includes('class_type') ||
          error.code === 'eval::required_col_not_found' ||
          error.code === 'eval::named_field_not_found') {
        console.log(`[${agentId}] components table needs migration (missing class_type)`)

        // Get existing data
        let existingData = []
        try {
          const result = await db.run(`
            ?[component_id, name, file_id] := *components{component_id, name, file_id}
          `)
          existingData = result.rows || []
          console.log(`[${agentId}]   Found ${existingData.length} existing components`)
        } catch (e) {
          console.log(`[${agentId}]   No existing components found`)
        }

        // Drop old table
        try {
          await db.run(`::remove components`)
          console.log(`[${agentId}]   Dropped old components table`)
        } catch (e) {
          // Table might not exist
        }

        // Create new table with class_type
        await db.run(`
          :create components {
            component_id: String
            =>
            name: String,
            file_id: String,
            class_type: String default 'class'
          }
        `)
        console.log(`[${agentId}]   Created new components table with class_type`)

        // Restore data with default class_type
        for (const row of existingData) {
          const escapeStr = (s) => s ? `'${String(s).replace(/'/g, "''").replace(/\\/g, '\\\\')}'` : 'null'
          await db.run(`
            ?[component_id, name, file_id, class_type] <- [[
              ${escapeStr(row[0])},
              ${escapeStr(row[1])},
              ${escapeStr(row[2])},
              'class'
            ]]
            :put components
          `)
        }

        if (existingData.length > 0) {
          console.log(`[${agentId}]   Restored ${existingData.length} components`)
        }

        migratedComponents = true
        console.log(`[${agentId}] ✓ components table migrated`)
      } else if (error.code === 'eval::stored_relation_not_found') {
        // Table doesn't exist at all - will be created when needed
        console.log(`[${agentId}] components table doesn't exist yet (OK)`)
      } else {
        throw error
      }
    }

  } finally {
    // CozoDB doesn't have an explicit close method - cleanup is handled by GC
  }

  return { migratedConversations, migratedComponents }
}

async function main() {
  console.log('='.repeat(60))
  console.log('Agent Database Migration Tool')
  console.log('='.repeat(60))

  if (!fs.existsSync(AGENTS_DIR)) {
    console.log(`\nNo agents directory found at ${AGENTS_DIR}`)
    return
  }

  const agentDirs = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  console.log(`\nFound ${agentDirs.length} agent(s) to check`)

  let totalMigrated = 0
  let totalConversations = 0
  let totalComponents = 0
  let errors = []

  for (const agentId of agentDirs) {
    const dbPath = path.join(AGENTS_DIR, agentId, 'agent.db')

    if (!fs.existsSync(dbPath)) {
      console.log(`\n[${agentId}] No database found, skipping`)
      continue
    }

    try {
      const result = await migrateDatabase(agentId, dbPath)
      if (result.migratedConversations || result.migratedComponents) {
        totalMigrated++
      }
      if (result.migratedConversations) totalConversations++
      if (result.migratedComponents) totalComponents++
    } catch (error) {
      console.error(`\n[${agentId}] ERROR: ${error.message}`)
      errors.push({ agentId, error: error.message })
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('Migration Summary')
  console.log('='.repeat(60))
  console.log(`Total agents checked: ${agentDirs.length}`)
  console.log(`Databases migrated: ${totalMigrated}`)
  console.log(`  - conversations table: ${totalConversations}`)
  console.log(`  - components table: ${totalComponents}`)

  if (errors.length > 0) {
    console.log(`\nErrors: ${errors.length}`)
    for (const e of errors) {
      console.log(`  - ${e.agentId}: ${e.error}`)
    }
  }

  console.log('\n✅ Migration complete')
}

main().catch(console.error)

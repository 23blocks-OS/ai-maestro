#!/usr/bin/env node
/**
 * Migrate all agent databases to Phase 5 schema
 *
 * This script ensures all agent databases have Phase 5 tables:
 * - transcripts (stored conversation transcripts for export/playback)
 * - playback_state (persistent playback position and speed)
 * - export_jobs (background job tracking for transcript exports)
 *
 * Since these are new tables with no existing data to migrate,
 * we simply create them if they don't exist.
 */

import fs from 'fs'
import path from 'path'
import { CozoDb } from 'cozo-node'

const AGENTS_DIR = path.join(process.env.HOME, '.aimaestro', 'agents')

async function migrateDatabase(agentId, dbPath) {
  console.log(`\n[${agentId}] Opening database...`)

  // CozoDB constructor takes (engine, path) - use 'sqlite' engine
  const db = new CozoDb('sqlite', dbPath)

  let migratedTranscripts = false
  let migratedPlaybackState = false
  let migratedExportJobs = false

  try {
    // =========================================================================
    // CREATE TRANSCRIPTS TABLE
    // =========================================================================
    try {
      // Check if transcripts table exists
      await db.run(`?[transcript_id] := *transcripts{transcript_id} :limit 1`)
      console.log(`[${agentId}] transcripts table OK (already exists)`)
    } catch (error) {
      if (error.code === 'eval::stored_relation_not_found') {
        console.log(`[${agentId}] transcripts table needs creation (doesn't exist)`)

        // Create transcripts table
        await db.run(`
          :create transcripts {
            transcript_id: String
            =>
            agent_id: String,
            session_id: String,
            start_time: Int,
            end_time: Int,
            message_count: Int,
            file_path: String,
            format: String,
            created_at: Int,
            updated_at: Int
          }
        `)
        console.log(`[${agentId}]   Created transcripts table`)

        migratedTranscripts = true
        console.log(`[${agentId}] ✓ transcripts table migrated`)
      } else {
        throw error
      }
    }

    // =========================================================================
    // CREATE PLAYBACK STATE TABLE
    // =========================================================================
    try {
      // Check if playback_state table exists
      await db.run(`?[agent_id] := *playback_state{agent_id} :limit 1`)
      console.log(`[${agentId}] playback_state table OK (already exists)`)
    } catch (error) {
      if (error.code === 'eval::stored_relation_not_found') {
        console.log(`[${agentId}] playback_state table needs creation (doesn't exist)`)

        // Create playback_state table
        await db.run(`
          :create playback_state {
              agent_id: String,
              session_id: String
              =>
              is_playing: Bool,
              current_position: Int,
              playback_speed: Float,
              updated_at: Int
            }
        `)
        console.log(`[${agentId}]   Created playback_state table`)

        migratedPlaybackState = true
        console.log(`[${agentId}] ✓ playback_state table migrated`)
      } else {
        throw error
      }
    }

    // =========================================================================
    // CREATE EXPORT JOBS TABLE
    // =========================================================================
    try {
      // Check if export_jobs table exists
      await db.run(`?[job_id] := *export_jobs{job_id} :limit 1`)
      console.log(`[${agentId}] export_jobs table OK (already exists)`)
    } catch (error) {
      if (error.code === 'eval::stored_relation_not_found') {
        console.log(`[${agentId}] export_jobs table needs creation (doesn't exist)`)

        // Create export_jobs table
        await db.run(`
          :create export_jobs {
              job_id: String
              =>
              agent_id: String,
              session_id: String,
              export_type: String,
              status: String,
              progress: Float,
              file_path: String?,
              created_at: Int,
              completed_at: Int?,
              error: String?
            }
        `)
        console.log(`[${agentId}]   Created export_jobs table`)

        migratedExportJobs = true
        console.log(`[${agentId}] ✓ export_jobs table migrated`)
      } else {
        throw error
      }
    }

  } finally {
    // CozoDB doesn't have an explicit close method - cleanup is handled by GC
  }

  return { migratedTranscripts, migratedPlaybackState, migratedExportJobs }
}

async function main() {
  console.log('='.repeat(60))
  console.log('Phase 5 Database Migration Tool')
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
  let totalTranscripts = 0
  let totalPlaybackState = 0
  let totalExportJobs = 0
  let errors = []

  for (const agentId of agentDirs) {
    const dbPath = path.join(AGENTS_DIR, agentId, 'agent.db')

    if (!fs.existsSync(dbPath)) {
      console.log(`\n[${agentId}] No database found, skipping`)
      continue
    }

    try {
      const result = await migrateDatabase(agentId, dbPath)
      if (result.migratedTranscripts || result.migratedPlaybackState || result.migratedExportJobs) {
        totalMigrated++
      }
      if (result.migratedTranscripts) totalTranscripts++
      if (result.migratedPlaybackState) totalPlaybackState++
      if (result.migratedExportJobs) totalExportJobs++
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
  console.log(`  - transcripts table: ${totalTranscripts}`)
  console.log(`  - playback_state table: ${totalPlaybackState}`)
  console.log(`  - export_jobs table: ${totalExportJobs}`)

  if (errors.length > 0) {
    console.log(`\nErrors: ${errors.length}`)
    for (const e of errors) {
      console.log(`  - ${e.agentId}: ${e.error}`)
    }
  }

  console.log('\n✅ Migration complete')
}

main().catch(console.error)

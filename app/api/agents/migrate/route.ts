import { NextResponse } from 'next/server'
import {
  migrateMessagesToAgents,
  needsMigration,
  getMigrationStatus
} from '@/lib/migrate-messages'

/**
 * GET /api/agents/migrate
 * Check migration status
 */
export async function GET() {
  try {
    const status = getMigrationStatus()
    return NextResponse.json(status)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check migration status'
    console.error('Failed to check migration status:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/agents/migrate
 * Run migration from session-based to agent-based message storage
 */
export async function POST() {
  try {
    // Check if migration is needed
    if (!needsMigration()) {
      return NextResponse.json({
        message: 'No migration needed',
        results: { migrated: 0, symlinked: 0, errors: [] }
      })
    }

    // Run migration
    const results = await migrateMessagesToAgents()

    if (results.errors.length > 0) {
      return NextResponse.json({
        message: 'Migration completed with errors',
        results
      }, { status: 207 }) // 207 Multi-Status
    }

    return NextResponse.json({
      message: 'Migration completed successfully',
      results
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run migration'
    console.error('Failed to run migration:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

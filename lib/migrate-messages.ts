import fs from 'fs'
import path from 'path'
import os from 'os'
import { loadAgents } from './agent-registry'

const MESSAGE_DIR = path.join(os.homedir(), '.aimaestro', 'messages')

/**
 * Migrate messages from session-based storage to agent-based storage
 *
 * Old structure:
 *   ~/.aimaestro/messages/inbox/<session-name>/
 *   ~/.aimaestro/messages/sent/<session-name>/
 *   ~/.aimaestro/messages/archived/<session-name>/
 *
 * New structure:
 *   ~/.aimaestro/messages/inbox/<agent-id>/
 *   ~/.aimaestro/messages/sent/<agent-id>/
 *   ~/.aimaestro/messages/archived/<agent-id>/
 *
 * Creates symlinks from old paths to new paths for backward compatibility
 */
export async function migrateMessagesToAgents(): Promise<{
  migrated: number
  symlinked: number
  errors: string[]
}> {
  const results = {
    migrated: 0,
    symlinked: 0,
    errors: [] as string[]
  }

  try {
    const agents = loadAgents()

    for (const agent of agents) {
      // Skip agents without sessions
      if (!agent.tools.session) {
        continue
      }

      const sessionName = agent.tools.session.tmuxSessionName
      const agentId = agent.id

      // Migrate for each message box type
      for (const boxType of ['inbox', 'sent', 'archived']) {
        const oldPath = path.join(MESSAGE_DIR, boxType, sessionName)
        const newPath = path.join(MESSAGE_DIR, boxType, agentId)

        // Check if old path exists
        if (!fs.existsSync(oldPath)) {
          continue
        }

        try {
          // If new path doesn't exist, move the directory
          if (!fs.existsSync(newPath)) {
            fs.renameSync(oldPath, newPath)
            results.migrated++

            // Create symlink from old path to new path for backward compatibility
            fs.symlinkSync(newPath, oldPath, 'dir')
            results.symlinked++
          } else {
            // If new path exists, merge the directories
            const files = fs.readdirSync(oldPath)
            for (const file of files) {
              const oldFilePath = path.join(oldPath, file)
              const newFilePath = path.join(newPath, file)

              // Only move if file doesn't exist in new location
              if (!fs.existsSync(newFilePath)) {
                fs.renameSync(oldFilePath, newFilePath)
              }
            }

            // Remove old directory if empty
            const remainingFiles = fs.readdirSync(oldPath)
            if (remainingFiles.length === 0) {
              fs.rmdirSync(oldPath)

              // Create symlink
              fs.symlinkSync(newPath, oldPath, 'dir')
              results.symlinked++
            }

            results.migrated++
          }
        } catch (error) {
          results.errors.push(
            `Failed to migrate ${boxType} for agent ${agent.alias} (${sessionName}): ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
    }
  } catch (error) {
    results.errors.push(
      `Migration failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  return results
}

/**
 * Check if migration is needed
 * Returns true if there are session-based message directories that aren't symlinks
 */
export function needsMigration(): boolean {
  const agents = loadAgents()

  for (const agent of agents) {
    if (!agent.tools.session) {
      continue
    }

    const sessionName = agent.tools.session.tmuxSessionName

    for (const boxType of ['inbox', 'sent', 'archived']) {
      const oldPath = path.join(MESSAGE_DIR, boxType, sessionName)

      // Check if path exists and is not a symlink
      if (fs.existsSync(oldPath) && !fs.lstatSync(oldPath).isSymbolicLink()) {
        return true
      }
    }
  }

  return false
}

/**
 * Get migration status
 */
export function getMigrationStatus(): {
  needsMigration: boolean
  sessionBasedDirs: string[]
  agentBasedDirs: string[]
  symlinks: string[]
} {
  const status = {
    needsMigration: false,
    sessionBasedDirs: [] as string[],
    agentBasedDirs: [] as string[],
    symlinks: [] as string[]
  }

  const agents = loadAgents()

  for (const agent of agents) {
    if (!agent.tools.session) {
      continue
    }

    const sessionName = agent.tools.session.tmuxSessionName
    const agentId = agent.id

    for (const boxType of ['inbox', 'sent', 'archived']) {
      const oldPath = path.join(MESSAGE_DIR, boxType, sessionName)
      const newPath = path.join(MESSAGE_DIR, boxType, agentId)

      if (fs.existsSync(oldPath)) {
        if (fs.lstatSync(oldPath).isSymbolicLink()) {
          status.symlinks.push(oldPath)
        } else {
          status.sessionBasedDirs.push(oldPath)
          status.needsMigration = true
        }
      }

      if (fs.existsSync(newPath)) {
        status.agentBasedDirs.push(newPath)
      }
    }
  }

  return status
}

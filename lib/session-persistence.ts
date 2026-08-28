import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * A session that was RUNNING when it was recorded — the intent record used to
 * bring agents back after a server restart.
 *
 * The intent semantics already existed and are correct: persistSession() on
 * wake means "this should be running", unpersistSession() on hibernate or kill
 * means "this should stay down". A sleeping agent stays asleep because it is
 * simply not in this file.
 *
 * What was missing is enough detail to relaunch faithfully. The old record held
 * only id/name/workingDirectory, so restore could create a bare tmux session
 * but not start the agent's program — which would have been worse than staying
 * offline: a session that looks alive in the API with nothing running inside.
 */
export interface PersistedSession {
  id: string
  name: string
  workingDirectory: string
  createdAt: string
  lastSavedAt: string
  agentId?: string  // Link to agent (optional for backward compatibility)
  /** Program to relaunch (claude, codex, ...). Absent on pre-0.37.2 records. */
  program?: string
  /** Permission mode the agent was woken with. */
  permissionMode?: string
  /** Session index for agents with more than one session. */
  sessionIndex?: number
}

// Everything else in AI Maestro lives under ~/.aimaestro; this file used
// ~/.ai-maestro, a separate directory one hyphen away. Moved in 0.37.2.
//
// The old file is deliberately NOT migrated. Its 73 entries were unusable —
// stale, `agentId: none`, and working directories all wrongly defaulted to the
// server's own repo. Carrying them over would preserve nothing and, now that
// boot restore exists, would try to spawn ~73 wrong sessions on the next
// restart. Starting clean is the safer state; the legacy file is left in place
// untouched. session-persistence.ts is the only reader or writer of this file,
// so nothing else is affected by the move.
const PERSISTENCE_DIR = path.join(os.homedir(), '.aimaestro')
const SESSIONS_FILE = path.join(PERSISTENCE_DIR, 'sessions.json')

/**
 * Ensure the persistence directory exists
 */
function ensurePersistenceDir() {
  if (!fs.existsSync(PERSISTENCE_DIR)) {
    fs.mkdirSync(PERSISTENCE_DIR, { recursive: true })
  }
}

/**
 * Load persisted sessions from disk
 */
export function loadPersistedSessions(): PersistedSession[] {
  try {
    ensurePersistenceDir()

    if (!fs.existsSync(SESSIONS_FILE)) {
      return []
    }

    const data = fs.readFileSync(SESSIONS_FILE, 'utf-8')
    const sessions = JSON.parse(data)

    return Array.isArray(sessions) ? sessions : []
  } catch (error) {
    console.error('Failed to load persisted sessions:', error)
    return []
  }
}

/**
 * Save sessions to disk
 */
export function savePersistedSessions(sessions: PersistedSession[]) {
  try {
    ensurePersistenceDir()

    const data = JSON.stringify(sessions, null, 2)
    fs.writeFileSync(SESSIONS_FILE, data, 'utf-8')

    return true
  } catch (error) {
    console.error('Failed to save persisted sessions:', error)
    return false
  }
}

/**
 * Add or update a session in persistence
 */
export function persistSession(session: Omit<PersistedSession, 'lastSavedAt'>) {
  const sessions = loadPersistedSessions()

  const existingIndex = sessions.findIndex(s => s.id === session.id)

  const persistedSession: PersistedSession = {
    ...session,
    lastSavedAt: new Date().toISOString()
  }

  if (existingIndex >= 0) {
    sessions[existingIndex] = persistedSession
  } else {
    sessions.push(persistedSession)
  }

  return savePersistedSessions(sessions)
}

/**
 * Remove a session from persistence
 */
export function unpersistSession(sessionId: string) {
  const sessions = loadPersistedSessions()
  const filtered = sessions.filter(s => s.id !== sessionId)
  return savePersistedSessions(filtered)
}

/**
 * Clear all persisted sessions
 */
export function clearPersistedSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      fs.unlinkSync(SESSIONS_FILE)
    }
    return true
  } catch (error) {
    console.error('Failed to clear persisted sessions:', error)
    return false
  }
}

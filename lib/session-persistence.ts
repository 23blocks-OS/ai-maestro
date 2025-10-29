import fs from 'fs'
import path from 'path'
import os from 'os'

export interface PersistedSession {
  id: string
  name: string
  workingDirectory: string
  createdAt: string
  lastSavedAt: string
}

const PERSISTENCE_DIR = path.join(os.homedir(), '.ai-maestro')
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

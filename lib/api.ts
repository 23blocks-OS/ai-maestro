import type { Session } from '@/types/session'

const API_BASE_URL = '/api'

export async function fetchSessions(): Promise<Session[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    return data.sessions || []
  } catch (error) {
    console.error('Failed to fetch sessions:', error)
    throw error
  }
}

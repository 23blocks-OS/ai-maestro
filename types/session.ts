export interface Session {
  id: string
  name: string
  workingDirectory: string
  status: 'active' | 'idle' | 'disconnected'
  createdAt: string
  lastActivity: string
  windows: number
}

export type SessionStatus = Session['status']

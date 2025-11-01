export interface Session {
  id: string
  name: string
  workingDirectory: string
  status: 'active' | 'idle' | 'disconnected'
  createdAt: string
  lastActivity: string
  windows: number
  agentId?: string  // Link to agent (optional for backward compatibility)
}

export type SessionStatus = Session['status']

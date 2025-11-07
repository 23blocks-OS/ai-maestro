export interface Session {
  id: string
  name: string
  workingDirectory: string
  status: 'active' | 'idle' | 'disconnected'
  createdAt: string
  lastActivity: string
  windows: number
  agentId?: string  // Link to agent (optional for backward compatibility)

  // Remote host metadata (Manager/Worker pattern)
  hostId?: string      // Host identifier (e.g., "mac-mini", "local")
  hostName?: string    // Human-readable host name (e.g., "Mac Mini")
  remote?: boolean     // true if session is on a remote host
  version?: string     // AI Maestro version (e.g., "0.9.2")
}

export type SessionStatus = Session['status']

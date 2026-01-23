/**
 * Session - Represents a tmux session (terminal connection metadata)
 *
 * NOTE: Session is NOT the primary entity in AI Maestro. Agents are.
 * Use UnifiedAgent from '@/types/agent' for agent-centric operations.
 *
 * Session exists to represent the raw tmux terminal connection info needed
 * for WebSocket connections (TerminalView, ChatView, etc.).
 *
 * Relationship:
 * - Agent (first-class) has Tools, one of which is SessionTool (tmux terminal)
 * - Session represents the connection metadata for that tmux terminal
 */
export interface Session {
  id: string                    // tmux session name (used for WebSocket connection)
  name: string                  // Display name
  workingDirectory: string      // Current working directory
  status: 'active' | 'idle' | 'disconnected'
  createdAt: string
  lastActivity: string
  windows: number               // Number of tmux windows
  agentId?: string              // Link to parent Agent (optional for backward compatibility)

  // Remote host metadata (peer mesh network)
  hostId?: string               // Host identifier (e.g., "mac-mini", "local")
  hostName?: string             // Human-readable host name (e.g., "Mac Mini")
  remote?: boolean              // true if session is on a remote host
  version?: string              // AI Maestro version (e.g., "0.9.2")
}

export type SessionStatus = Session['status']

/**
 * Team types for the Team Meeting feature
 *
 * Teams represent groups of agents that can be assembled into
 * a "war room" for multi-agent coordination sessions.
 *
 * All teams are closed (isolated messaging). External messages are
 * routed through the chief-of-staff. Agents can only message
 * teammates + COS + manager. Open teams were removed in the
 * governance simplification (2026-03-27).
 */

/**
 * Team communication type — always 'closed' after governance simplification.
 * Kept as a type alias for backward compatibility with serialized data and
 * cross-host peer summaries that still include a `type` field.
 * @deprecated All teams are now closed. This type will be removed in a future version.
 */
export type TeamType = 'closed'

/** Per-team kanban column configuration */
export interface KanbanColumnConfig {
  id: string           // Column key, used as task status value (e.g., "ai-review")
  label: string        // Display name (e.g., "AI Review")
  color: string        // Tailwind dot color class (e.g., "bg-purple-400")
  icon?: string        // Lucide icon name (e.g., "SearchCheck") — resolved at render time
}

/** Default 5-column kanban — used when team has no custom kanban config */
export const DEFAULT_KANBAN_COLUMNS: KanbanColumnConfig[] = [
  { id: 'backlog', label: 'Backlog', color: 'bg-gray-500', icon: 'Archive' },
  { id: 'pending', label: 'To Do', color: 'bg-gray-400', icon: 'Circle' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-blue-400', icon: 'PlayCircle' },
  { id: 'review', label: 'Review', color: 'bg-amber-400', icon: 'Eye' },
  { id: 'completed', label: 'Done', color: 'bg-emerald-400', icon: 'CheckCircle2' },
]

/** GitHub Project link — when set, AI Maestro kanban is a live browser of the GitHub Project */
export interface GitHubProjectLink {
  owner: string          // Repository owner (user or org), e.g. "23blocks-OS"
  repo: string           // Repository name, e.g. "ai-maestro"
  number: number         // GitHub Project number (visible in project URL)
}

export interface Team {
  id: string              // UUID
  name: string            // "Backend Squad"
  description?: string
  agentIds: string[]      // Agent UUIDs (order = display order)
  instructions?: string   // Team-level markdown (like a per-team CLAUDE.md)
  type: TeamType           // Always 'closed' — all teams use isolated messaging + ACL
                           // Kept for backward compat with serialized data; always 'closed' at runtime
  chiefOfStaffId?: string | null // Agent UUID of this team's Chief-of-Staff (every team must have one)
  orchestratorId?: string | null // Agent UUID of this team's Orchestrator (primary kanban manager)
  kanbanConfig?: KanbanColumnConfig[] // Per-team kanban columns (if undefined, use DEFAULT_KANBAN_COLUMNS)
  githubProject?: GitHubProjectLink   // When set, kanban browses GitHub Project (source of truth)
  /**
   * @planned Layer 3 -- type stub only, not yet populated or consumed anywhere.
   * Will map agentId -> hostId for multi-host team membership tracking.
   * Target implementation: Phase 2 multi-host team support.
   */
  agentHostMap?: Record<string, string>
  blocked?: boolean       // true when no MANAGER exists — team ops frozen, agents hibernated
  createdAt: string       // ISO
  updatedAt: string       // ISO
  lastMeetingAt?: string  // ISO - last time a meeting was started with this team
  lastActivityAt?: string // ISO - updated on any team interaction
}

export interface TeamsFile {
  version: 1
  teams: Team[]
}

/** Meeting status for persistent rooms */
export type MeetingStatus = 'active' | 'ended'

/** Persistent meeting record */
export interface Meeting {
  id: string                    // UUID
  teamId: string | null         // Link to team for task persistence
  groupId?: string | null       // Link to group for meeting integration (groups feature)
  name: string                  // Display name
  agentIds: string[]            // Participating agent UUIDs
  status: MeetingStatus
  activeAgentId: string | null  // Last-viewed agent
  sidebarMode: SidebarMode
  startedAt: string             // ISO
  lastActiveAt: string          // ISO
  endedAt?: string              // ISO (when ended)
}

export interface MeetingsFile {
  version: 1
  meetings: Meeting[]
}

/** State machine states for team meeting */
export type MeetingPhase = 'idle' | 'selecting' | 'ringing' | 'active'

/** Sidebar display mode during active meeting */
export type SidebarMode = 'grid' | 'list'

/** Right panel tab for active meetings */
export type RightPanelTab = 'tasks' | 'chat'

/** State for the team meeting page */
export interface TeamMeetingState {
  phase: MeetingPhase
  selectedAgentIds: string[]
  teamName: string
  notifyAmp: boolean
  activeAgentId: string | null
  joinedAgentIds: string[]
  sidebarMode: SidebarMode
  meetingId: string | null
  rightPanelOpen: boolean
  rightPanelTab: RightPanelTab
  kanbanOpen: boolean
}

/** Actions for the team meeting reducer */
export type TeamMeetingAction =
  | { type: 'SELECT_AGENT'; agentId: string }
  | { type: 'DESELECT_AGENT'; agentId: string }
  | { type: 'LOAD_TEAM'; agentIds: string[]; teamName: string }
  | { type: 'START_MEETING' }
  | { type: 'AGENT_JOINED'; agentId: string }
  | { type: 'ALL_JOINED' }
  | { type: 'END_MEETING' }
  | { type: 'SET_ACTIVE_AGENT'; agentId: string }
  | { type: 'TOGGLE_SIDEBAR_MODE' }
  | { type: 'SET_TEAM_NAME'; name: string }
  | { type: 'SET_NOTIFY_AMP'; enabled: boolean }
  | { type: 'ADD_AGENT'; agentId: string }
  | { type: 'REMOVE_AGENT'; agentId: string }
  | { type: 'TOGGLE_RIGHT_PANEL' }
  | { type: 'SET_RIGHT_PANEL_TAB'; tab: RightPanelTab }
  | { type: 'OPEN_RIGHT_PANEL'; tab: RightPanelTab }
  | { type: 'OPEN_KANBAN' }
  | { type: 'CLOSE_KANBAN' }
  // Uses full Meeting type because all fields are needed to restore reducer state from persistence.
  // Consider using Pick<Meeting, ...> if the set of needed fields becomes a strict subset.
  | { type: 'RESTORE_MEETING'; meeting: Meeting }

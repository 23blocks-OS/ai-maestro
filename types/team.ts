/**
 * Team types for the Team Meeting feature
 *
 * Teams represent groups of agents that can be assembled into
 * a "war room" for multi-agent coordination sessions.
 *
 * Team types:
 * - open (default): No messaging restrictions. Backward compatible.
 * - closed: Isolated messaging. External messages routed through the
 *   chief-of-staff. Agents can only message teammates + COS + manager.
 */

/**
 * Team communication type
 * - open: No restrictions, any agent can message team members (default, backward compat)
 * - closed: Isolated — messages from outside the team are routed through the chief-of-staff
 */
export type TeamType = 'open' | 'closed'

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
  type: TeamType           // 'open' (default) or 'closed' — governs messaging isolation and ACL
                           // Always present at runtime — loadTeams() migration guarantees this field is populated
  chiefOfStaffId?: string | null // Agent UUID of this team's Chief-of-Staff (null/undefined for open teams)
  kanbanConfig?: KanbanColumnConfig[] // Per-team kanban columns (if undefined, use DEFAULT_KANBAN_COLUMNS)
  githubProject?: GitHubProjectLink   // When set, kanban browses GitHub Project (source of truth)
  /**
   * @planned Layer 3 -- type stub only, not yet populated or consumed anywhere.
   * Will map agentId -> hostId for multi-host team membership tracking.
   * Target implementation: Phase 2 multi-host team support.
   */
  agentHostMap?: Record<string, string>
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

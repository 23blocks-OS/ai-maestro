/**
 * Team types for the Team Meeting feature
 *
 * Teams represent groups of agents that can be assembled into
 * a "war room" for multi-agent coordination sessions.
 */

export interface Team {
  id: string              // UUID
  name: string            // "Backend Squad"
  description?: string
  agentIds: string[]      // Agent UUIDs (order = display order)
  createdAt: string       // ISO
  updatedAt: string       // ISO
  lastMeetingAt?: string  // ISO - last time a meeting was started with this team
}

export interface TeamsFile {
  version: 1
  teams: Team[]
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
  | { type: 'TOGGLE_RIGHT_PANEL' }
  | { type: 'SET_RIGHT_PANEL_TAB'; tab: RightPanelTab }
  | { type: 'OPEN_RIGHT_PANEL'; tab: RightPanelTab }
  | { type: 'OPEN_KANBAN' }
  | { type: 'CLOSE_KANBAN' }

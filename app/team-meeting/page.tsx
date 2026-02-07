'use client'

import { useReducer, useCallback, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAgents } from '@/hooks/useAgents'
import { useTasks } from '@/hooks/useTasks'
import { useMeetingMessages } from '@/hooks/useMeetingMessages'
import { TerminalProvider } from '@/contexts/TerminalContext'
import AgentPicker from '@/components/team-meeting/AgentPicker'
import SelectedAgentsBar from '@/components/team-meeting/SelectedAgentsBar'
import MeetingHeader from '@/components/team-meeting/MeetingHeader'
import MeetingSidebar from '@/components/team-meeting/MeetingSidebar'
import MeetingTerminalArea from '@/components/team-meeting/MeetingTerminalArea'
import MeetingRightPanel from '@/components/team-meeting/MeetingRightPanel'
import TaskKanbanBoard from '@/components/team-meeting/TaskKanbanBoard'
import RingingAnimation from '@/components/team-meeting/RingingAnimation'
import type { TeamMeetingState, TeamMeetingAction, Team, RightPanelTab } from '@/types/team'

const TeamSaveDialog = dynamic(
  () => import('@/components/team-meeting/TeamSaveDialog'),
  { ssr: false }
)

const TeamLoadDialog = dynamic(
  () => import('@/components/team-meeting/TeamLoadDialog'),
  { ssr: false }
)

function generateMeetingId(): string {
  return `meeting-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// State machine initial state
const initialState: TeamMeetingState = {
  phase: 'idle',
  selectedAgentIds: [],
  teamName: '',
  notifyAmp: false,
  activeAgentId: null,
  joinedAgentIds: [],
  sidebarMode: 'grid',
  meetingId: null,
  rightPanelOpen: false,
  rightPanelTab: 'tasks',
  kanbanOpen: false,
}

// Reducer for clean state transitions
function meetingReducer(state: TeamMeetingState, action: TeamMeetingAction): TeamMeetingState {
  switch (action.type) {
    case 'SELECT_AGENT':
      if (state.phase === 'active') {
        return {
          ...state,
          selectedAgentIds: state.selectedAgentIds.includes(action.agentId)
            ? state.selectedAgentIds
            : [...state.selectedAgentIds, action.agentId],
          joinedAgentIds: state.joinedAgentIds.includes(action.agentId)
            ? state.joinedAgentIds
            : [...state.joinedAgentIds, action.agentId],
        }
      }
      return {
        ...state,
        phase: 'selecting',
        selectedAgentIds: state.selectedAgentIds.includes(action.agentId)
          ? state.selectedAgentIds.filter(id => id !== action.agentId)
          : [...state.selectedAgentIds, action.agentId],
      }

    case 'DESELECT_AGENT':
      return {
        ...state,
        selectedAgentIds: state.selectedAgentIds.filter(id => id !== action.agentId),
        phase: state.selectedAgentIds.length <= 1 ? 'idle' : state.phase,
      }

    case 'LOAD_TEAM':
      return {
        ...state,
        phase: 'selecting',
        selectedAgentIds: action.agentIds,
        teamName: action.teamName,
      }

    case 'START_MEETING':
      return {
        ...state,
        phase: 'ringing',
        joinedAgentIds: [],
        meetingId: generateMeetingId(),
      }

    case 'AGENT_JOINED':
      return {
        ...state,
        joinedAgentIds: [...state.joinedAgentIds, action.agentId],
      }

    case 'ALL_JOINED':
      return {
        ...state,
        phase: 'active',
        activeAgentId: state.selectedAgentIds[0] || null,
      }

    case 'END_MEETING':
      return { ...initialState }

    case 'SET_ACTIVE_AGENT':
      return { ...state, activeAgentId: action.agentId }

    case 'TOGGLE_SIDEBAR_MODE':
      return { ...state, sidebarMode: state.sidebarMode === 'grid' ? 'list' : 'grid' }

    case 'SET_TEAM_NAME':
      return { ...state, teamName: action.name }

    case 'SET_NOTIFY_AMP':
      return { ...state, notifyAmp: action.enabled }

    case 'ADD_AGENT':
      if (state.selectedAgentIds.includes(action.agentId)) return state
      return {
        ...state,
        selectedAgentIds: [...state.selectedAgentIds, action.agentId],
        joinedAgentIds: state.phase === 'active'
          ? [...state.joinedAgentIds, action.agentId]
          : state.joinedAgentIds,
      }

    case 'TOGGLE_RIGHT_PANEL':
      return { ...state, rightPanelOpen: !state.rightPanelOpen }

    case 'SET_RIGHT_PANEL_TAB':
      return { ...state, rightPanelTab: action.tab }

    case 'OPEN_RIGHT_PANEL':
      return { ...state, rightPanelOpen: true, rightPanelTab: action.tab }

    case 'OPEN_KANBAN':
      return { ...state, kanbanOpen: true }

    case 'CLOSE_KANBAN':
      return { ...state, kanbanOpen: false }

    default:
      return state
  }
}

export default function TeamMeetingPage() {
  const { agents, loading } = useAgents()
  const [state, dispatch] = useReducer(meetingReducer, initialState)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [showAgentPickerInMeeting, setShowAgentPickerInMeeting] = useState(false)

  // We need a stable teamId for task persistence.
  // Use the team name as a lookup key once meeting starts, or generate a temp one.
  const [teamId, setTeamId] = useState<string | null>(null)

  // Look up or create team ID when meeting starts
  useEffect(() => {
    if (state.phase === 'active' && !teamId && state.teamName) {
      // Try to find existing team by name
      fetch('/api/teams')
        .then(r => r.json())
        .then(data => {
          const existing = (data.teams || []).find((t: Team) => t.name === state.teamName)
          if (existing) {
            setTeamId(existing.id)
          } else {
            // Create a temporary team for task persistence
            fetch('/api/teams', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: state.teamName || 'Untitled Meeting',
                agentIds: state.selectedAgentIds,
              }),
            })
              .then(r => r.json())
              .then(data => setTeamId(data.team?.id || null))
              .catch(() => {})
          }
        })
        .catch(() => {})
    }
    if (state.phase === 'idle') {
      setTeamId(null)
    }
  }, [state.phase, state.teamName, state.selectedAgentIds, teamId])

  const selectedAgents = state.selectedAgentIds
    .map(id => agents.find(a => a.id === id))
    .filter(Boolean) as typeof agents

  // Task hook
  const taskHook = useTasks(teamId)

  // Meeting messages hook
  const chatHook = useMeetingMessages({
    meetingId: state.meetingId,
    participantIds: state.selectedAgentIds,
    teamName: state.teamName || 'Meeting',
    isActive: state.phase === 'active',
  })

  // Trigger terminal resize when right panel toggles
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => clearTimeout(timer)
  }, [state.rightPanelOpen])

  const handleToggleAgent = useCallback((agentId: string) => {
    dispatch({ type: 'SELECT_AGENT', agentId })
  }, [])

  const handleStartMeeting = useCallback(async () => {
    dispatch({ type: 'START_MEETING' })

    if (state.notifyAmp && state.selectedAgentIds.length > 0) {
      fetch('/api/teams/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentIds: state.selectedAgentIds,
          teamName: state.teamName || 'Unnamed Team',
        }),
      }).catch(err => console.error('Failed to notify team:', err))
    }
  }, [state.notifyAmp, state.selectedAgentIds, state.teamName])

  const handleSaveTeam = useCallback(async (name: string, description: string) => {
    try {
      await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          agentIds: state.selectedAgentIds,
        }),
      })
      setShowSaveDialog(false)
    } catch (error) {
      console.error('Failed to save team:', error)
    }
  }, [state.selectedAgentIds])

  const handleLoadTeam = useCallback((team: Team) => {
    dispatch({ type: 'LOAD_TEAM', agentIds: team.agentIds, teamName: team.name })
    setTeamId(team.id)
    setShowLoadDialog(false)
  }, [])

  const handleAgentJoined = useCallback((agentId: string) => {
    dispatch({ type: 'AGENT_JOINED', agentId })
  }, [])

  const handleAllJoined = useCallback(() => {
    dispatch({ type: 'ALL_JOINED' })
  }, [])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    )
  }

  const isActive = state.phase === 'active'
  const isRinging = state.phase === 'ringing'
  const activeTaskCount = taskHook.tasks.filter(t => t.status !== 'completed').length

  return (
    <TerminalProvider key="team-meeting">
      <div className="flex flex-col h-screen bg-gray-950" style={{ overflow: 'hidden', position: 'fixed', inset: 0 }}>

        {/* === ACTIVE MEETING === */}
        {isActive && (
          <>
            <MeetingHeader
              teamName={state.teamName}
              agentCount={selectedAgents.length}
              onSetTeamName={(name) => dispatch({ type: 'SET_TEAM_NAME', name })}
              onAddAgent={() => setShowAgentPickerInMeeting(true)}
              onEndMeeting={() => dispatch({ type: 'END_MEETING' })}
              rightPanelOpen={state.rightPanelOpen}
              onToggleRightPanel={() => dispatch({ type: 'TOGGLE_RIGHT_PANEL' })}
              onOpenKanban={() => dispatch({ type: 'OPEN_KANBAN' })}
              onOpenTasks={() => dispatch({ type: 'OPEN_RIGHT_PANEL', tab: 'tasks' })}
              onOpenChat={() => dispatch({ type: 'OPEN_RIGHT_PANEL', tab: 'chat' })}
              taskCount={activeTaskCount}
              chatUnreadCount={chatHook.unreadCount}
            />

            <div className="flex flex-1 overflow-hidden">
              <MeetingSidebar
                agents={selectedAgents}
                activeAgentId={state.activeAgentId}
                sidebarMode={state.sidebarMode}
                onSelectAgent={(id) => dispatch({ type: 'SET_ACTIVE_AGENT', agentId: id })}
                onToggleMode={() => dispatch({ type: 'TOGGLE_SIDEBAR_MODE' })}
                onAddAgent={() => setShowAgentPickerInMeeting(true)}
                tasksByAgent={taskHook.tasksByAgent}
              />

              <MeetingTerminalArea
                agents={selectedAgents}
                activeAgentId={state.activeAgentId}
              />

              {state.rightPanelOpen && teamId && (
                <MeetingRightPanel
                  activeTab={state.rightPanelTab}
                  onTabChange={(tab: RightPanelTab) => dispatch({ type: 'SET_RIGHT_PANEL_TAB', tab })}
                  onClose={() => dispatch({ type: 'TOGGLE_RIGHT_PANEL' })}
                  agents={selectedAgents}
                  tasks={taskHook.tasks}
                  pendingTasks={taskHook.pendingTasks}
                  inProgressTasks={taskHook.inProgressTasks}
                  completedTasks={taskHook.completedTasks}
                  onCreateTask={taskHook.createTask}
                  onUpdateTask={taskHook.updateTask}
                  onDeleteTask={taskHook.deleteTask}
                  chatMessages={chatHook.messages}
                  chatUnreadCount={chatHook.unreadCount}
                  onSendToAgent={chatHook.sendToAgent}
                  onBroadcastToAll={chatHook.broadcastToAll}
                  onMarkChatRead={chatHook.markAsRead}
                />
              )}
            </div>

            {showAgentPickerInMeeting && (
              <div className="fixed inset-0 z-40 bg-gray-950/90 backdrop-blur-sm flex flex-col">
                <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800">
                  <h3 className="text-sm font-medium text-white">Add Agent to Meeting</h3>
                  <button
                    onClick={() => setShowAgentPickerInMeeting(false)}
                    className="text-sm px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                  >
                    Done
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-6">
                  <AgentPicker
                    agents={agents}
                    selectedAgentIds={state.selectedAgentIds}
                    onToggleAgent={(agentId) => dispatch({ type: 'ADD_AGENT', agentId })}
                  />
                </div>
              </div>
            )}

            {state.kanbanOpen && teamId && (
              <TaskKanbanBoard
                agents={selectedAgents}
                tasks={taskHook.tasks}
                tasksByStatus={taskHook.tasksByStatus}
                onUpdateTask={taskHook.updateTask}
                onDeleteTask={taskHook.deleteTask}
                onCreateTask={taskHook.createTask}
                onClose={() => dispatch({ type: 'CLOSE_KANBAN' })}
                teamName={state.teamName}
              />
            )}
          </>
        )}

        {/* === SELECTION PHASE (idle / selecting / ringing) === */}
        {!isActive && (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-shrink-0">
              <Link
                href="/"
                className="p-1 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-300"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <h1 className="text-sm text-white font-medium">Team Meeting</h1>
              <div className="flex-1" />
              {state.selectedAgentIds.length > 0 && (
                <span className="text-xs text-gray-500">
                  {state.selectedAgentIds.length} selected
                </span>
              )}
            </div>

            {/* Agent picker */}
            <div className="flex-1 overflow-auto p-6">
              <AgentPicker
                agents={agents}
                selectedAgentIds={state.selectedAgentIds}
                onToggleAgent={handleToggleAgent}
              />
            </div>

            {/* Bottom bar */}
            <SelectedAgentsBar
              agents={agents}
              selectedAgentIds={state.selectedAgentIds}
              teamName={state.teamName}
              notifyAmp={state.notifyAmp}
              onDeselectAgent={(id) => dispatch({ type: 'DESELECT_AGENT', agentId: id })}
              onSetTeamName={(name) => dispatch({ type: 'SET_TEAM_NAME', name })}
              onSetNotifyAmp={(enabled) => dispatch({ type: 'SET_NOTIFY_AMP', enabled })}
              onStartMeeting={handleStartMeeting}
              onSaveTeam={() => setShowSaveDialog(true)}
              onLoadTeam={() => setShowLoadDialog(true)}
            />
          </>
        )}

        {/* === RINGING OVERLAY (on top of everything) === */}
        {isRinging && (
          <RingingAnimation
            agents={selectedAgents}
            joinedAgentIds={state.joinedAgentIds}
            teamName={state.teamName}
            onAgentJoined={handleAgentJoined}
            onAllJoined={handleAllJoined}
          />
        )}

        {/* Save dialog */}
        <TeamSaveDialog
          isOpen={showSaveDialog}
          initialName={state.teamName}
          agentCount={state.selectedAgentIds.length}
          onClose={() => setShowSaveDialog(false)}
          onSave={handleSaveTeam}
        />

        {/* Load dialog */}
        <TeamLoadDialog
          isOpen={showLoadDialog}
          onClose={() => setShowLoadDialog(false)}
          onLoad={handleLoadTeam}
        />
      </div>
    </TerminalProvider>
  )
}

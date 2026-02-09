'use client'

import { useReducer, useCallback, useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
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
import { VersionChecker } from '@/components/VersionChecker'
import type { TeamMeetingState, TeamMeetingAction, Team, RightPanelTab, Meeting } from '@/types/team'

const TeamSaveDialog = dynamic(
  () => import('@/components/team-meeting/TeamSaveDialog'),
  { ssr: false }
)

const TeamLoadDialog = dynamic(
  () => import('@/components/team-meeting/TeamLoadDialog'),
  { ssr: false }
)

function generateTeamName(): string {
  const adjectives = ['Alpha', 'Neon', 'Turbo', 'Quantum', 'Cosmic', 'Hyper', 'Stealth', 'Omega', 'Rapid', 'Nova', 'Phantom', 'Apex', 'Iron', 'Blaze', 'Frost']
  const nouns = ['Squad', 'Force', 'Pack', 'Crew', 'Unit', 'Team', 'Guild', 'Fleet', 'Swarm', 'Core', 'Vanguard', 'Brigade', 'Syndicate', 'Alliance', 'Collective']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  return `${adj} ${noun}`
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

    case 'REMOVE_AGENT': {
      const remaining = state.selectedAgentIds.filter(id => id !== action.agentId)
      if (remaining.length === 0) return state // Don't allow empty meeting
      return {
        ...state,
        selectedAgentIds: remaining,
        joinedAgentIds: state.joinedAgentIds.filter(id => id !== action.agentId),
        activeAgentId: state.activeAgentId === action.agentId
          ? remaining[0] || null
          : state.activeAgentId,
      }
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

    case 'RESTORE_MEETING': {
      const agentIds = Array.isArray(action.meeting.agentIds) ? action.meeting.agentIds : []
      return {
        ...state,
        phase: 'active',
        selectedAgentIds: agentIds,
        joinedAgentIds: agentIds,
        teamName: action.meeting.name || '',
        activeAgentId: action.meeting.activeAgentId || agentIds[0] || null,
        sidebarMode: action.meeting.sidebarMode || 'grid',
        meetingId: action.meeting.id,
        // Transient UI resets on restore
        rightPanelOpen: false,
        rightPanelTab: 'tasks',
        kanbanOpen: false,
      }
    }

    default:
      return state
  }
}

interface MeetingRoomProps {
  meetingId: string
  teamParam?: string | null
}

export default function MeetingRoom({ meetingId, teamParam }: MeetingRoomProps) {
  const router = useRouter()
  const { agents, loading: agentsLoading } = useAgents()
  const [state, dispatch] = useReducer(meetingReducer, initialState)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [showAgentPickerInMeeting, setShowAgentPickerInMeeting] = useState(false)
  const [teamId, setTeamId] = useState<string | null>(null)
  const isNewMeeting = meetingId === 'new'
  const [restoring, setRestoring] = useState(!isNewMeeting)
  const [notFound, setNotFound] = useState(false)
  const persistedMeetingIdRef = useRef<string | null>(null)

  // Restore meeting from disk on mount (skip for new meetings)
  useEffect(() => {
    if (isNewMeeting) return
    let cancelled = false
    async function restore() {
      try {
        const res = await fetch(`/api/meetings/${meetingId}`)
        if (!res.ok) {
          if (!cancelled) setNotFound(true)
          return
        }
        const data = await res.json()
        const meeting: Meeting = data.meeting
        if (cancelled) return

        if (meeting.status === 'ended') {
          setNotFound(true)
          return
        }

        persistedMeetingIdRef.current = meeting.id
        setTeamId(meeting.teamId)
        dispatch({ type: 'RESTORE_MEETING', meeting, teamId: meeting.teamId })
      } catch {
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setRestoring(false)
      }
    }
    restore()
    return () => { cancelled = true }
  }, [meetingId, isNewMeeting])

  // Auto-load team from ?team= query param (for "Start Meeting from Team Card" flow)
  useEffect(() => {
    if (!isNewMeeting || !teamParam) return
    let cancelled = false
    async function loadTeamFromParam() {
      try {
        const res = await fetch(`/api/teams/${teamParam}`)
        if (!res.ok) return
        const data = await res.json()
        const team: Team = data.team
        if (cancelled || !team) return
        dispatch({ type: 'LOAD_TEAM', agentIds: team.agentIds, teamName: team.name })
        setTeamId(team.id)
      } catch {
        // silent — user can still pick agents manually
      }
    }
    loadTeamFromParam()
    return () => { cancelled = true }
  }, [isNewMeeting, teamParam])

  // When meeting becomes active and there's no persisted meeting record yet (new meeting flow),
  // create one
  useEffect(() => {
    if (state.phase !== 'active' || persistedMeetingIdRef.current) return
    if (!state.teamName.trim() || state.selectedAgentIds.length === 0) return

    async function createMeetingRecord() {
      // Ensure we have a teamId first
      let resolvedTeamId = teamId
      if (!resolvedTeamId && state.teamName.trim()) {
        try {
          const teamsRes = await fetch('/api/teams')
          const teamsData = await teamsRes.json()
          const existing = (teamsData.teams || []).find((t: Team) => t.name === state.teamName)
          if (existing) {
            resolvedTeamId = existing.id
          } else {
            const createRes = await fetch('/api/teams', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: state.teamName,
                agentIds: state.selectedAgentIds,
              }),
            })
            const createData = await createRes.json()
            resolvedTeamId = createData.team?.id || null
          }
          setTeamId(resolvedTeamId)
        } catch {
          // continue without teamId
        }
      }

      try {
        const res = await fetch('/api/meetings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: state.teamName,
            agentIds: state.selectedAgentIds,
            teamId: resolvedTeamId,
            sidebarMode: state.sidebarMode,
          }),
        })
        const data = await res.json()
        if (data.meeting) {
          persistedMeetingIdRef.current = data.meeting.id
          // Update URL without full navigation
          window.history.replaceState(null, '', `/team-meeting?meeting=${data.meeting.id}`)
        }
      } catch {
        // meeting still works ephemerally
      }
    }
    createMeetingRecord()
  }, [state.phase, state.teamName, state.selectedAgentIds, state.sidebarMode, teamId])

  // Persist activeAgentId changes
  useEffect(() => {
    if (!persistedMeetingIdRef.current || !state.activeAgentId) return
    fetch(`/api/meetings/${persistedMeetingIdRef.current}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeAgentId: state.activeAgentId }),
    }).catch(() => {})
  }, [state.activeAgentId])

  // Persist agentIds changes
  useEffect(() => {
    if (!persistedMeetingIdRef.current || state.phase !== 'active') return
    fetch(`/api/meetings/${persistedMeetingIdRef.current}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentIds: state.selectedAgentIds }),
    }).catch(() => {})
  }, [state.selectedAgentIds, state.phase])

  // Persist sidebarMode changes
  useEffect(() => {
    if (!persistedMeetingIdRef.current || state.phase !== 'active') return
    fetch(`/api/meetings/${persistedMeetingIdRef.current}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sidebarMode: state.sidebarMode }),
    }).catch(() => {})
  }, [state.sidebarMode, state.phase])

  // Heartbeat: update lastActiveAt every 30s
  useEffect(() => {
    if (!persistedMeetingIdRef.current || state.phase !== 'active') return
    const interval = setInterval(() => {
      fetch(`/api/meetings/${persistedMeetingIdRef.current}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastActiveAt: new Date().toISOString() }),
      }).catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [state.phase])

  // Team ID resolution for restored meetings that may not have one
  useEffect(() => {
    if (state.phase === 'active' && !teamId && state.teamName.trim()) {
      fetch('/api/teams')
        .then(r => r.json())
        .then(data => {
          const existing = (data.teams || []).find((t: Team) => t.name === state.teamName)
          if (existing) {
            setTeamId(existing.id)
          } else {
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
  }, [state.phase, state.teamName, state.selectedAgentIds, teamId])

  // Trigger terminal resize when right panel toggles
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => clearTimeout(timer)
  }, [state.rightPanelOpen])

  const selectedAgents = state.selectedAgentIds
    .map(id => agents.find(a => a.id === id))
    .filter(Boolean) as typeof agents

  const taskHook = useTasks(teamId)

  const chatHook = useMeetingMessages({
    meetingId: persistedMeetingIdRef.current || state.meetingId,
    participantIds: state.selectedAgentIds,
    teamName: state.teamName || 'Meeting',
    isActive: state.phase === 'active',
  })

  // Poll unread message counts per agent (every 10s)
  const [messageCountsByAgent, setMessageCountsByAgent] = useState<Record<string, number>>({})
  useEffect(() => {
    if (state.phase !== 'active' || state.selectedAgentIds.length === 0) return
    let cancelled = false

    async function fetchCounts() {
      const counts: Record<string, number> = {}
      await Promise.all(
        state.selectedAgentIds.map(async (agentId) => {
          try {
            const res = await fetch(`/api/messages?agent=${encodeURIComponent(agentId)}&action=unread-count`)
            if (res.ok) {
              const data = await res.json()
              counts[agentId] = data.count || 0
            }
          } catch {
            // skip
          }
        })
      )
      if (!cancelled) setMessageCountsByAgent(counts)
    }

    fetchCounts()
    const interval = setInterval(fetchCounts, 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [state.phase, state.selectedAgentIds])

  const handleToggleAgent = useCallback((agentId: string) => {
    dispatch({ type: 'SELECT_AGENT', agentId })
  }, [])

  const handleStartMeeting = useCallback(async () => {
    if (!state.teamName.trim()) {
      dispatch({ type: 'SET_TEAM_NAME', name: generateTeamName() })
    }
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

  const handleEndMeeting = useCallback(async () => {
    if (persistedMeetingIdRef.current) {
      try {
        await fetch(`/api/meetings/${persistedMeetingIdRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'ended',
            endedAt: new Date().toISOString(),
          }),
        })
      } catch {
        // best-effort
      }
    }
    dispatch({ type: 'END_MEETING' })
    router.push('/team-meeting')
  }, [router])

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

  // Loading states
  if (agentsLoading || restoring) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-400">Meeting not found or has ended.</p>
        <button
          onClick={() => router.push('/team-meeting')}
          className="text-sm px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
        >
          Back to Lobby
        </button>
      </div>
    )
  }

  const isActive = state.phase === 'active'
  const isRinging = state.phase === 'ringing'
  const activeTaskCount = taskHook.tasks.filter(t => t.status !== 'completed').length

  return (
    <TerminalProvider key={`meeting-${meetingId}`}>
      <div className="flex flex-col h-screen bg-gray-950" style={{ overflow: 'hidden', position: 'fixed', inset: 0 }}>

        {/* === ACTIVE MEETING === */}
        {isActive && (
          <>
            <MeetingHeader
              teamName={state.teamName}
              agentCount={selectedAgents.length}
              onSetTeamName={(name) => {
                dispatch({ type: 'SET_TEAM_NAME', name })
                // Persist name change
                if (persistedMeetingIdRef.current) {
                  fetch(`/api/meetings/${persistedMeetingIdRef.current}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                  }).catch(() => {})
                }
              }}
              onAddAgent={() => setShowAgentPickerInMeeting(true)}
              onEndMeeting={handleEndMeeting}
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
                onRemoveAgent={(id) => dispatch({ type: 'REMOVE_AGENT', agentId: id })}
                onToggleMode={() => dispatch({ type: 'TOGGLE_SIDEBAR_MODE' })}
                onAddAgent={() => setShowAgentPickerInMeeting(true)}
                tasksByAgent={taskHook.tasksByAgent}
                messageCountsByAgent={messageCountsByAgent}
                canRemove={selectedAgents.length > 1}
              />

              {state.kanbanOpen && teamId ? (
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
              ) : (
                <MeetingTerminalArea
                  agents={selectedAgents}
                  activeAgentId={state.activeAgentId}
                />
              )}

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
          </>
        )}

        {/* === SELECTION PHASE (idle / selecting / ringing) === */}
        {!isActive && (
          <>
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-shrink-0">
              <button
                onClick={() => router.push('/team-meeting')}
                className="p-1 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              </button>
              <h1 className="text-sm text-white font-medium">New Meeting</h1>
              <div className="flex-1" />
              {state.selectedAgentIds.length > 0 && (
                <span className="text-xs text-gray-500">
                  {state.selectedAgentIds.length} selected
                </span>
              )}
            </div>

            <div className="flex-1 overflow-auto p-6">
              <AgentPicker
                agents={agents}
                selectedAgentIds={state.selectedAgentIds}
                onToggleAgent={handleToggleAgent}
              />
            </div>

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

        {/* === RINGING OVERLAY === */}
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

        {/* Footer */}
        <footer className="border-t border-gray-800 bg-gray-950 px-4 py-2 flex-shrink-0">
          <div className="flex flex-col md:flex-row justify-between items-center gap-1 md:gap-0 md:h-5">
            <p className="text-xs md:text-sm text-white leading-none">
              <VersionChecker /> • Made with <span className="text-red-500 text-lg inline-block scale-x-125">♥</span> in Boulder Colorado
            </p>
            <p className="text-xs md:text-sm text-white leading-none">
              Concept by{' '}
              <a href="https://x.com/jkpelaez" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">
                Juan Pelaez
              </a>{' '}
              @{' '}
              <a href="https://23blocks.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-red-500 hover:text-red-400 transition-colors">
                23blocks
              </a>
              . Coded by Claude
            </p>
          </div>
        </footer>
      </div>
    </TerminalProvider>
  )
}

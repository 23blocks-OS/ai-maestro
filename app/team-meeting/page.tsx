'use client'

import { useReducer, useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAgents } from '@/hooks/useAgents'
import { TerminalProvider } from '@/contexts/TerminalContext'
import AgentPicker from '@/components/team-meeting/AgentPicker'
import SelectedAgentsBar from '@/components/team-meeting/SelectedAgentsBar'
import MeetingHeader from '@/components/team-meeting/MeetingHeader'
import MeetingSidebar from '@/components/team-meeting/MeetingSidebar'
import MeetingTerminalArea from '@/components/team-meeting/MeetingTerminalArea'
import RingingAnimation from '@/components/team-meeting/RingingAnimation'
import type { TeamMeetingState, TeamMeetingAction, Team } from '@/types/team'

const TeamSaveDialog = dynamic(
  () => import('@/components/team-meeting/TeamSaveDialog'),
  { ssr: false }
)

const TeamLoadDialog = dynamic(
  () => import('@/components/team-meeting/TeamLoadDialog'),
  { ssr: false }
)

// State machine initial state
const initialState: TeamMeetingState = {
  phase: 'idle',
  selectedAgentIds: [],
  teamName: '',
  notifyAmp: false,
  activeAgentId: null,
  joinedAgentIds: [],
  sidebarMode: 'grid',
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

  const selectedAgents = state.selectedAgentIds
    .map(id => agents.find(a => a.id === id))
    .filter(Boolean) as typeof agents

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
            />

            <div className="flex flex-1 overflow-hidden">
              <MeetingSidebar
                agents={selectedAgents}
                activeAgentId={state.activeAgentId}
                sidebarMode={state.sidebarMode}
                onSelectAgent={(id) => dispatch({ type: 'SET_ACTIVE_AGENT', agentId: id })}
                onToggleMode={() => dispatch({ type: 'TOGGLE_SIDEBAR_MODE' })}
                onAddAgent={() => setShowAgentPickerInMeeting(true)}
              />

              <MeetingTerminalArea
                agents={selectedAgents}
                activeAgentId={state.activeAgentId}
              />
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

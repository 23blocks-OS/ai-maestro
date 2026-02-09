'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Video, ChevronRight, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { Meeting } from '@/types/team'
import type { UnifiedAgent } from '@/types/agent'
import MeetingCard from './MeetingCard'

interface MeetingListViewProps {
  agents: UnifiedAgent[]
  searchQuery: string
}

export default function MeetingListView({ agents, searchQuery }: MeetingListViewProps) {
  const router = useRouter()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [recentExpanded, setRecentExpanded] = useState(true)

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch('/api/meetings')
      const data = await res.json()
      setMeetings(data.meetings || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMeetings()
    // Poll every 10s for active meeting changes
    const interval = setInterval(fetchMeetings, 10000)
    return () => clearInterval(interval)
  }, [fetchMeetings])

  const filtered = searchQuery.trim()
    ? meetings.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : meetings

  const activeMeetings = filtered.filter(m => m.status === 'active')
  const recentMeetings = filtered.filter(m => m.status === 'ended')

  const handleJoin = (meeting: Meeting) => {
    router.push(`/team-meeting?meeting=${meeting.id}`)
  }

  const handleEnd = async (meeting: Meeting) => {
    try {
      await fetch(`/api/meetings/${meeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ended', endedAt: new Date().toISOString() }),
      })
      setMeetings(prev => prev.map(m =>
        m.id === meeting.id ? { ...m, status: 'ended' as const, endedAt: new Date().toISOString() } : m
      ))
    } catch {
      // silent
    }
  }

  const handleDelete = async (meeting: Meeting) => {
    try {
      await fetch(`/api/meetings/${meeting.id}`, { method: 'DELETE' })
      setMeetings(prev => prev.filter(m => m.id !== meeting.id))
    } catch {
      // silent
    }
  }

  const handleNewMeeting = () => {
    router.push('/team-meeting?meeting=new')
  }

  if (loading) {
    return (
      <div className="px-4 py-8 text-center text-gray-400">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400 mx-auto mb-2" />
        <p className="text-xs">Loading meetings...</p>
      </div>
    )
  }

  const noResults = activeMeetings.length === 0 && recentMeetings.length === 0

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
        {/* New meeting button */}
        <div className="px-3 mb-2">
          <button
            onClick={handleNewMeeting}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-gray-300 border border-dashed border-gray-700 hover:border-gray-600 hover:bg-gray-800/50 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            New Meeting
          </button>
        </div>

        {noResults ? (
          <div className="px-6 py-8 text-center">
            <Video className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-1">
              {searchQuery ? 'No meetings match your search' : 'No meetings yet'}
            </p>
            {!searchQuery && (
              <p className="text-xs text-gray-600">
                Start a meeting to coordinate your agents
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Active meetings */}
            {activeMeetings.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-500">
                    Active ({activeMeetings.length})
                  </span>
                </div>
                <div className="space-y-0.5">
                  {activeMeetings.map(meeting => (
                    <MeetingCard
                      key={meeting.id}
                      meeting={meeting}
                      agents={agents}
                      onJoin={handleJoin}
                      onEnd={handleEnd}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recent meetings */}
            {recentMeetings.length > 0 && (
              <div>
                <button
                  onClick={() => setRecentExpanded(!recentExpanded)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500 hover:text-gray-400 transition-colors"
                >
                  <ChevronRight className={`w-3 h-3 transition-transform ${recentExpanded ? 'rotate-90' : ''}`} />
                  Recent ({recentMeetings.length})
                </button>
                {recentExpanded && (
                  <div className="space-y-0.5">
                    {recentMeetings.map(meeting => (
                      <MeetingCard
                        key={meeting.id}
                        meeting={meeting}
                        agents={agents}
                        onJoin={handleJoin}
                        onEnd={handleEnd}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Pop-out to full Meeting Rooms page */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-gray-800">
        <Link
          href="/team-meeting"
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 transition-all group"
        >
          <ExternalLink className="w-3.5 h-3.5 group-hover:text-emerald-400 transition-colors" />
          Open Meeting Rooms
        </Link>
      </div>
    </div>
  )
}

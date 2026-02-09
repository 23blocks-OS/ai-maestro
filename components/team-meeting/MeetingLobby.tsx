'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Users, Clock, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import type { Meeting } from '@/types/team'

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface MeetingLobbyProps {
  onNewMeeting: () => void
}

export default function MeetingLobby({ onNewMeeting }: MeetingLobbyProps) {
  const router = useRouter()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [showRecent, setShowRecent] = useState(false)

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch('/api/meetings')
      const data = await res.json()
      setMeetings(data.meetings || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  const activeMeetings = meetings.filter(m => m.status === 'active')
  const recentMeetings = meetings
    .filter(m => m.status === 'ended')
    .sort((a, b) => new Date(b.endedAt || b.lastActiveAt).getTime() - new Date(a.endedAt || a.lastActiveAt).getTime())

  const handleJoin = (id: string) => {
    router.push(`/team-meeting?meeting=${id}`)
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/meetings/${id}`, { method: 'DELETE' })
      setMeetings(prev => prev.filter(m => m.id !== id))
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950" style={{ overflow: 'hidden', position: 'fixed', inset: 0 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-shrink-0">
        <Link
          href="/"
          className="p-1 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-300"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2 text-emerald-400">
          <Users className="w-4 h-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Meeting Rooms</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={onNewMeeting}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          New Meeting
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Active meetings */}
            {activeMeetings.length > 0 ? (
              <div className="mb-8">
                <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                  Active Meetings ({activeMeetings.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeMeetings.map(meeting => (
                    <div
                      key={meeting.id}
                      onClick={() => handleJoin(meeting.id)}
                      className="group relative bg-gray-800/60 border border-gray-700 hover:border-emerald-500/50 rounded-xl p-4 cursor-pointer transition-all duration-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-sm font-medium text-white">{meeting.name}</span>
                        </div>
                        <button
                          onClick={(e) => handleDelete(meeting.id, e)}
                          className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete meeting"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Agent avatars */}
                      <div className="flex items-center gap-1 mb-3">
                        {meeting.agentIds.slice(0, 5).map((_, i) => (
                          <div
                            key={i}
                            className="w-6 h-6 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center text-[10px] text-gray-400"
                          >
                            A
                          </div>
                        ))}
                        {meeting.agentIds.length > 5 && (
                          <span className="text-[10px] text-gray-500 ml-1">
                            +{meeting.agentIds.length - 5}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[10px] text-gray-500">
                          <Clock className="w-3 h-3" />
                          Started {formatTimeAgo(meeting.startedAt)}
                        </div>
                        <span className="text-xs text-gray-500">
                          {meeting.agentIds.length} agent{meeting.agentIds.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-20">
                <Users className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-4">No active meetings</p>
                <button
                  onClick={onNewMeeting}
                  className="inline-flex items-center gap-1.5 text-sm px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Start a Meeting
                </button>
              </div>
            )}

            {/* Recent meetings */}
            {recentMeetings.length > 0 && (
              <div>
                <button
                  onClick={() => setShowRecent(!showRecent)}
                  className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-3 hover:text-gray-400 transition-colors"
                >
                  {showRecent ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Recent ({recentMeetings.length})
                </button>
                {showRecent && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {recentMeetings.map(meeting => (
                      <div
                        key={meeting.id}
                        className="group relative bg-gray-800/30 border border-gray-800 rounded-xl p-4 opacity-60"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-sm text-gray-400">{meeting.name}</span>
                          <button
                            onClick={(e) => handleDelete(meeting.id, e)}
                            className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete meeting"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-gray-600">
                          <Clock className="w-3 h-3" />
                          Ended {formatTimeAgo(meeting.endedAt || meeting.lastActiveAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

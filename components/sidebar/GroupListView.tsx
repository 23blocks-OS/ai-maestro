'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, UsersRound, X } from 'lucide-react'
import type { Group } from '@/types/group'
import type { UnifiedAgent } from '@/types/agent'
import GroupCard from './GroupCard'

interface GroupListViewProps {
  agents: UnifiedAgent[]
  searchQuery: string
}

export default function GroupListView({ agents, searchQuery }: GroupListViewProps) {
  const router = useRouter()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/groups')
      const data = await res.json()
      setGroups(data.groups || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const filtered = searchQuery.trim()
    ? groups.filter(g =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : groups

  // Navigate to team-meeting page with group context
  const handleStartMeeting = (group: Group) => {
    router.push(`/team-meeting?meeting=new&group=${group.id}`)
  }

  const handleDelete = async (group: Group) => {
    try {
      await fetch(`/api/groups/${group.id}`, { method: 'DELETE' })
      setGroups(prev => prev.filter(g => g.id !== group.id))
    } catch {
      // silent
    }
  }

  const handleSave = async (name: string, description: string, subscriberIds: string[], groupId?: string) => {
    try {
      if (groupId) {
        // Edit existing group
        const res = await fetch(`/api/groups/${groupId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, subscriberIds }),
        })
        const data = await res.json()
        if (data.group) {
          setGroups(prev => prev.map(g => g.id === groupId ? data.group : g))
        }
      } else {
        // Create new group
        const res = await fetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, subscriberIds }),
        })
        const data = await res.json()
        if (data.group) {
          setGroups(prev => [...prev, data.group])
        }
      }
      setShowCreate(false)
      setEditingGroup(null)
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-8 text-center text-gray-400">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400 mx-auto mb-2" />
        <p className="text-xs">Loading groups...</p>
      </div>
    )
  }

  return (
    <div className="py-2">
      {/* Create button */}
      <div className="px-3 mb-2">
        <button
          onClick={() => { setEditingGroup(null); setShowCreate(true) }}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-gray-300 border border-dashed border-gray-700 hover:border-gray-600 hover:bg-gray-800/50 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Group
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <UsersRound className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-1">
            {searchQuery ? 'No groups match your search' : 'No groups yet'}
          </p>
          {!searchQuery && (
            <p className="text-xs text-gray-600">
              Create a group to broadcast messages to agents
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-0.5">
          {filtered.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              agents={agents}
              onStartMeeting={handleStartMeeting}
              onEdit={(g) => { setEditingGroup(g); setShowCreate(true) }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create/Edit modal */}
      {showCreate && (
        <GroupFormModal
          group={editingGroup}
          agents={agents}
          onSave={handleSave}
          onClose={() => { setShowCreate(false); setEditingGroup(null) }}
        />
      )}
    </div>
  )
}

function GroupFormModal({
  group,
  agents,
  onSave,
  onClose,
}: {
  group: Group | null
  agents: UnifiedAgent[]
  onSave: (name: string, description: string, subscriberIds: string[], groupId?: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(group?.name || '')
  const [description, setDescription] = useState(group?.description || '')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(group?.subscriberIds || []))

  const toggleAgent = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave(name.trim(), description.trim(), Array.from(selectedIds), group?.id)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 rounded-xl w-full max-w-md shadow-2xl border border-gray-700 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-100">
            {group ? 'Edit Group' : 'Create Group'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Broadcast Channel"
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What this group is for..."
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Subscribers <span className="text-gray-600">({selectedIds.size} selected)</span>
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-700 rounded-lg p-2 bg-gray-800/50 custom-scrollbar">
              {agents.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-2">No agents available</p>
              ) : (
                agents.map(agent => {
                  const isSelected = selectedIds.has(agent.id)
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleAgent(agent.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-all ${
                        isSelected
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'text-gray-300 hover:bg-gray-700/50 border border-transparent'
                      }`}
                    >
                      {agent.avatar && (agent.avatar.startsWith('http') || agent.avatar.startsWith('/')) ? (
                        <img src={agent.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[9px] font-medium">
                          {(agent.label || agent.name || '?').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="truncate">{agent.label || agent.name}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {group ? 'Save Changes' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

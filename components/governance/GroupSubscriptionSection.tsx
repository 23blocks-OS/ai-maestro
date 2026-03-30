'use client'

import { useState, useEffect, useRef } from 'react'
import { UsersRound, Plus, X, ChevronDown } from 'lucide-react'
import type { Group } from '@/types/group'

interface GroupSubscriptionSectionProps {
  agentId: string
  onDataChanged?: () => void
}

export default function GroupSubscriptionSection({
  agentId,
  onDataChanged,
}: GroupSubscriptionSectionProps) {
  const [groups, setGroups] = useState<Group[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null) // tracks groupId being acted on
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch all groups on mount and when agentId changes (component may not remount on agent switch)
  useEffect(() => {
    const controller = new AbortController()
    fetchGroups(controller.signal)
    // Poll every 10s to pick up group changes from sidebar
    const interval = setInterval(() => fetchGroups(controller.signal), 10_000)
    return () => {
      clearInterval(interval)
      controller.abort()
    }
  }, [agentId])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDropdown])

  async function fetchGroups(signal?: AbortSignal) {
    try {
      const res = await fetch('/api/groups', { signal })
      if (!res.ok) return
      const data = await res.json()
      setGroups(data.groups || [])
    } catch {
      // Silently fail — groups feature may not be available
    }
  }

  // Groups the agent is subscribed to
  const subscribedGroups = groups.filter(g => g.subscriberIds.includes(agentId))
  // Groups the agent can subscribe to
  const availableGroups = groups.filter(g => !g.subscriberIds.includes(agentId))

  async function handleSubscribe(groupId: string) {
    setError(null)
    setLoading(groupId)
    try {
      const res = await fetch(`/api/groups/${groupId}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to subscribe')
        return
      }
      await fetchGroups()
      setShowDropdown(false)
      onDataChanged?.()
    } catch {
      setError('Failed to subscribe to group')
    } finally {
      setLoading(null)
    }
  }

  async function handleUnsubscribe(groupId: string) {
    setError(null)
    setLoading(groupId)
    try {
      const res = await fetch(`/api/groups/${groupId}/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to unsubscribe')
        return
      }
      await fetchGroups()
      onDataChanged?.()
    } catch {
      setError('Failed to unsubscribe from group')
    } finally {
      setLoading(null)
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!createName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim(),
          subscriberIds: [agentId], // auto-subscribe the current agent
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to create group')
        return
      }
      await fetchGroups()
      setShowCreateForm(false)
      setCreateName('')
      setCreateDesc('')
      onDataChanged?.()
    } catch {
      setError('Failed to create group')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      {/* Section header row */}
      <div className="flex items-center gap-2 mb-1 mt-3">
        <UsersRound className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-400 font-medium">Groups</span>
        <div className="ml-auto flex items-center gap-1.5">
          {/* Subscribe dropdown — only when there are groups to subscribe to */}
          {availableGroups.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="text-xs px-2 py-1 rounded border border-dashed border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Subscribe
                <ChevronDown className={`w-3 h-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showDropdown && (
                <div className="absolute right-0 z-20 bg-gray-800 border border-gray-700 rounded-lg p-1 max-h-48 overflow-y-auto mt-1 min-w-[180px]">
                  {availableGroups.map(group => (
                    <button
                      key={group.id}
                      onClick={() => handleSubscribe(group.id)}
                      disabled={loading === group.id}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                      <UsersRound className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      <span className="truncate">{group.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Create Group button — always visible */}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="text-xs px-2 py-1 rounded border border-dashed border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Create
          </button>
        </div>
      </div>

      {/* Inline create form */}
      {showCreateForm && (
        <form onSubmit={handleCreateGroup} className="mt-2 mb-1 bg-gray-800/60 rounded-lg border border-gray-700/50 p-2.5 space-y-2">
          <input
            type="text"
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            placeholder="Group name"
            autoFocus
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
          <input
            type="text"
            value={createDesc}
            onChange={e => setCreateDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowCreateForm(false); setCreateName(''); setCreateDesc('') }}
              className="text-xs px-2.5 py-1 rounded text-gray-400 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!createName.trim() || creating}
              className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* Subscribed groups list */}
      {subscribedGroups.length === 0 ? (
        <div className="text-sm text-gray-500 italic px-1">No group subscriptions</div>
      ) : (
        <div className="flex flex-wrap gap-1.5 px-1">
          {subscribedGroups.map(group => (
            <div
              key={group.id}
              className="flex items-center gap-1.5 text-sm px-2 py-1 rounded-md bg-gray-800/60 border border-gray-700/50 text-gray-300 group"
            >
              <UsersRound className="w-3 h-3 text-gray-500 flex-shrink-0" />
              <span className="truncate max-w-[140px]">{group.name}</span>
              <button
                onClick={() => handleUnsubscribe(group.id)}
                disabled={loading === group.id}
                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                title={`Unsubscribe from ${group.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="text-xs text-red-400 px-1 mt-1">{error}</div>
      )}
    </>
  )
}

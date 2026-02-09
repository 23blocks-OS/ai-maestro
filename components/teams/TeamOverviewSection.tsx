'use client'

import { useState } from 'react'
import { Users, Save, X, Plus, Trash2, ListTodo, FileText, Clock } from 'lucide-react'
import type { Team } from '@/types/team'
import type { Agent } from '@/types/agent'

interface TeamOverviewSectionProps {
  team: Team
  agents: Agent[]
  taskCount: number
  docCount: number
  onUpdateTeam: (updates: { name?: string; description?: string; agentIds?: string[] }) => Promise<void>
}

export default function TeamOverviewSection({ team, agents, taskCount, docCount, onUpdateTeam }: TeamOverviewSectionProps) {
  const [editingName, setEditingName] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description || '')
  const [showAddAgent, setShowAddAgent] = useState(false)

  const teamAgents = agents.filter(a => team.agentIds.includes(a.id))
  const availableAgents = agents.filter(a => !team.agentIds.includes(a.id))

  const handleSaveName = async () => {
    if (name.trim() && name !== team.name) {
      await onUpdateTeam({ name: name.trim() })
    }
    setEditingName(false)
  }

  const handleSaveDesc = async () => {
    if (description !== (team.description || '')) {
      await onUpdateTeam({ description })
    }
    setEditingDesc(false)
  }

  const handleRemoveAgent = async (agentId: string) => {
    const newIds = team.agentIds.filter(id => id !== agentId)
    await onUpdateTeam({ agentIds: newIds })
  }

  const handleAddAgent = async (agentId: string) => {
    const newIds = [...team.agentIds, agentId]
    await onUpdateTeam({ agentIds: newIds })
    setShowAddAgent(false)
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* Team Name */}
      <div className="mb-6">
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-2xl font-bold bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 text-white focus:outline-none focus:border-emerald-500 flex-1"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setName(team.name); setEditingName(false) } }}
            />
            <button onClick={handleSaveName} className="p-2 hover:bg-gray-800 rounded-lg text-emerald-400"><Save className="w-4 h-4" /></button>
            <button onClick={() => { setName(team.name); setEditingName(false) }} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <h1
            className="text-2xl font-bold text-white cursor-pointer hover:text-emerald-400 transition-colors"
            onClick={() => setEditingName(true)}
            title="Click to edit"
          >
            {team.name}
          </h1>
        )}
      </div>

      {/* Description */}
      <div className="mb-8">
        <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Description</label>
        {editingDesc ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500 resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={handleSaveDesc} className="text-xs px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors">Save</button>
              <button onClick={() => { setDescription(team.description || ''); setEditingDesc(false) }} className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <p
            className="text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors"
            onClick={() => setEditingDesc(true)}
            title="Click to edit"
          >
            {team.description || 'No description. Click to add one.'}
          </p>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <ListTodo className="w-4 h-4" />
            <span className="text-xs">Tasks</span>
          </div>
          <p className="text-2xl font-bold text-white">{taskCount}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <FileText className="w-4 h-4" />
            <span className="text-xs">Documents</span>
          </div>
          <p className="text-2xl font-bold text-white">{docCount}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs">Last Meeting</span>
          </div>
          <p className="text-sm font-medium text-white">
            {team.lastMeetingAt
              ? new Date(team.lastMeetingAt).toLocaleDateString()
              : 'Never'}
          </p>
        </div>
      </div>

      {/* Agent Roster */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-medium text-white">Agents ({teamAgents.length})</h3>
          </div>
          <button
            onClick={() => setShowAddAgent(!showAddAgent)}
            className="text-xs px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Add Agent
          </button>
        </div>

        {/* Add agent dropdown */}
        {showAddAgent && (
          <div className="mb-3 bg-gray-800 border border-gray-700 rounded-lg p-2 max-h-48 overflow-y-auto">
            {availableAgents.length === 0 ? (
              <p className="text-xs text-gray-500 px-2 py-1">No available agents to add</p>
            ) : (
              availableAgents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => handleAddAgent(agent.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] text-gray-300 flex-shrink-0">
                    {(agent.label || agent.name || agent.alias || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-300 truncate">{agent.label || agent.name || agent.alias || agent.id.slice(0, 8)}</span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Agent list */}
        <div className="space-y-1">
          {teamAgents.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No agents in this team yet</p>
          ) : (
            teamAgents.map(agent => (
              <div
                key={agent.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800/50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300 flex-shrink-0">
                  {(agent.label || agent.name || agent.alias || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{agent.label || agent.name || agent.alias || agent.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500 truncate">{agent.session?.status === 'online' ? 'Online' : 'Offline'}</p>
                </div>
                <button
                  onClick={() => handleRemoveAgent(agent.id)}
                  className="p-1 rounded hover:bg-red-900/30 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  title="Remove from team"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

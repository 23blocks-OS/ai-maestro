'use client'

import { useState } from 'react'
import { X, Save } from 'lucide-react'

interface TeamSaveDialogProps {
  isOpen: boolean
  initialName: string
  agentCount: number
  onClose: () => void
  onSave: (name: string, description: string) => void
}

export default function TeamSaveDialog({
  isOpen,
  initialName,
  agentCount,
  onClose,
  onSave,
}: TeamSaveDialogProps) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState('')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-medium text-white">Save Team</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Team Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Backend Squad"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-emerald-500 resize-none"
              rows={2}
              placeholder="What is this team for?"
            />
          </div>

          <p className="text-xs text-gray-500">
            {agentCount} agent{agentCount !== 1 ? 's' : ''} will be saved in this team.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(name, description)}
            disabled={!name.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            Save Team
          </button>
        </div>
      </div>
    </div>
  )
}

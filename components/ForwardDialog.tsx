'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { AgentRecipient } from './MessageCenter'

interface ForwardDialogProps {
  messageId: string
  fromAgentId: string
  allAgents: AgentRecipient[]
  reachableAgentIds?: string[] | null  // null = no filtering (all reachable)
  onConfirm: (toAgentId: string, note: string) => Promise<void>
  onCancel: () => void
}

export default function ForwardDialog({
  messageId,
  fromAgentId,
  allAgents,
  reachableAgentIds,
  onConfirm,
  onCancel,
}: ForwardDialogProps) {
  const [selectedAgent, setSelectedAgent] = useState('')
  const [forwardNote, setForwardNote] = useState('')
  const [isForwarding, setIsForwarding] = useState(false)

  const handleConfirm = async () => {
    if (!selectedAgent) {
      alert('Please select an agent to forward to')
      return
    }

    setIsForwarding(true)
    try {
      await onConfirm(selectedAgent, forwardNote)
    } finally {
      setIsForwarding(false)
    }
  }

  // Filter out current agent from options
  const availableAgents = allAgents.filter(a => a.id !== fromAgentId)

  // Apply governance filtering: exclude unreachable agents if governance data available
  const governanceFilteredAgents = reachableAgentIds
    ? availableAgents.filter(agent => reachableAgentIds.includes(agent.id))
    : availableAgents

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100">Forward Message</h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            disabled={isForwarding}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Agent Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Forward to agent:
            </label>
            {governanceFilteredAgents.length === 0 ? (
              <p className="text-sm text-amber-400">No agents available to forward to due to team governance restrictions.</p>
            ) : (
              <select
                id="forward-agent-select"
                name="forwardAgent"
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isForwarding}
              >
                <option value="">Select an agent...</option>
                {governanceFilteredAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.alias}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Forward Note */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Add a note (optional):
            </label>
            <textarea
              id="forward-note"
              name="forwardNote"
              value={forwardNote}
              onChange={(e) => setForwardNote(e.target.value)}
              placeholder="Add context for the recipient..."
              rows={4}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              disabled={isForwarding}
            />
            <p className="text-xs text-gray-400 mt-1">
              This note will appear at the top of the forwarded message
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-300 hover:text-gray-100 transition-colors"
            disabled={isForwarding}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isForwarding || !selectedAgent}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isForwarding ? 'Forwarding...' : 'Forward'}
          </button>
        </div>
      </div>
    </div>
  )
}

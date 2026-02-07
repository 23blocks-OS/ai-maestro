'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Users, User } from 'lucide-react'
import type { Agent } from '@/types/agent'

interface ChatMessage {
  id: string
  from: string
  fromAlias?: string
  fromLabel?: string
  to: string
  toAlias?: string
  timestamp: string
  subject: string
  preview: string
  isMine: boolean
  displayFrom: string
}

interface MeetingChatPanelProps {
  agents: Agent[]
  messages: ChatMessage[]
  onSendToAgent: (agentId: string, message: string) => Promise<void>
  onBroadcastToAll: (message: string) => Promise<void>
}

export default function MeetingChatPanel({ agents, messages, onSendToAgent, onBroadcastToAll }: MeetingChatPanelProps) {
  const [recipient, setRecipient] = useState<string>('all')
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || sending) return

    setSending(true)
    try {
      if (recipient === 'all') {
        await onBroadcastToAll(text)
      } else {
        await onSendToAgent(recipient, text)
      }
      setInputText('')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Filter messages based on selected recipient
  const filteredMessages = recipient === 'all'
    ? messages
    : messages.filter(m =>
        m.from === recipient || m.to === recipient ||
        m.fromAlias === recipient || m.toAlias === recipient
      )

  return (
    <div className="flex flex-col h-full">
      {/* Recipient selector */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-800 overflow-x-auto">
        <button
          onClick={() => setRecipient('all')}
          className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full whitespace-nowrap transition-colors ${
            recipient === 'all'
              ? 'bg-emerald-600/30 text-emerald-300'
              : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
          }`}
        >
          <Users className="w-3 h-3" />
          All
        </button>
        {agents.map(agent => {
          const name = agent.label || agent.name || agent.alias || agent.id.slice(0, 8)
          return (
            <button
              key={agent.id}
              onClick={() => setRecipient(agent.id)}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full whitespace-nowrap transition-colors ${
                recipient === agent.id
                  ? 'bg-blue-600/30 text-blue-300'
                  : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
              }`}
            >
              <User className="w-3 h-3" />
              {name.length > 15 ? name.slice(0, 15) + '...' : name}
            </button>
          )
        })}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {filteredMessages.length === 0 && (
          <p className="text-[11px] text-gray-600 text-center py-8">
            No messages yet. Send a message to get started.
          </p>
        )}
        {filteredMessages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.isMine ? 'items-end' : 'items-start'}`}
          >
            <span className="text-[9px] text-gray-600 mb-0.5">
              {msg.displayFrom} {msg.toAlias ? `→ ${msg.toAlias}` : ''}
            </span>
            <div
              className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${
                msg.isMine
                  ? 'bg-emerald-600/30 text-emerald-100'
                  : 'bg-gray-800 text-gray-300'
              }`}
            >
              {msg.preview}
            </div>
            <span className="text-[9px] text-gray-700 mt-0.5">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose area */}
      <div className="px-3 py-2 border-t border-gray-800">
        <div className="flex items-end gap-2">
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={recipient === 'all' ? 'Message all agents...' : `Message ${agents.find(a => a.id === recipient)?.label || 'agent'}...`}
            rows={1}
            className="flex-1 text-xs bg-gray-800/50 text-gray-200 placeholder-gray-600 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-gray-600 max-h-20"
            style={{ minHeight: '36px' }}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

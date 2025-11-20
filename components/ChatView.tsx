'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { Session } from '@/types/session'

interface ChatViewProps {
  session: Session
  isVisible?: boolean
}

interface ChatMessage {
  id: string
  content: string
  timestamp: Date
  type: 'output' | 'input'
}

export default function ChatView({ session, isVisible = true }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const accumulatorRef = useRef<string>('')
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { isConnected, sendMessage } = useWebSocket({
    sessionId: session.id,
    hostId: session.hostId,
    autoConnect: isVisible,
    onMessage: (data) => {
      // Strip ANSI codes
      const stripped = stripAnsi(data)

      // Handle carriage returns - these indicate status updates that overwrite
      if (stripped.includes('\r')) {
        const parts = stripped.split('\r')
        // Take the last part (final state)
        const finalContent = parts[parts.length - 1].trim()

        if (finalContent) {
          // Update or replace the last message if it was a status update
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1]
            // If last message was within 1 second and is output, update it (status update)
            if (lastMsg &&
                lastMsg.type === 'output' &&
                Date.now() - lastMsg.timestamp.getTime() < 1000) {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMsg,
                  content: finalContent,
                  timestamp: new Date()
                }
              ]
            }
            // Otherwise, add as new message
            return [
              ...prev,
              {
                id: `${Date.now()}-${Math.random()}`,
                content: finalContent,
                timestamp: new Date(),
                type: 'output'
              }
            ]
          })
        }
        accumulatorRef.current = ''
        return
      }

      // Normal accumulation
      accumulatorRef.current += stripped

      // Clear existing timeout
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
      }

      // Flush after 200ms of no new data
      flushTimeoutRef.current = setTimeout(() => {
        const content = accumulatorRef.current.trim()

        // Filter out pure whitespace or very short empty content
        if (!content || content.length < 1) {
          accumulatorRef.current = ''
          return
        }

        // Only filter out PURE box-drawing characters (no text mixed in)
        const isPureBoxDrawing = content.match(/^[┌┐└┘├┤┬┴┼─│━]+$/)
        if (isPureBoxDrawing) {
          accumulatorRef.current = ''
          return
        }

        setMessages(prev => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            content: content,
            timestamp: new Date(),
            type: 'output'
          }
        ])
        accumulatorRef.current = ''
      }, 200)
    },
  })

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when tab becomes visible
  useEffect(() => {
    if (isVisible && isConnected) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isVisible, isConnected])

  const handleSend = () => {
    if (!input.trim() || !isConnected) return

    // Add user input to messages
    setMessages(prev => [
      ...prev,
      {
        id: `${Date.now()}-input`,
        content: input,
        timestamp: new Date(),
        type: 'input'
      }
    ])

    // Send to terminal (with carriage return to execute)
    sendMessage(input + '\r')

    // Clear input
    setInput('')

    // Re-focus input
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClearMessages = () => {
    setMessages([])
    accumulatorRef.current = ''
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-medium text-gray-200">Simple Chat Interface</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {isConnected ? 'Connected' : 'Disconnected'} • {messages.length} message{messages.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={handleClearMessages}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
            title="Clear all messages"
          >
            Clear
          </button>
        </div>
        <div className="px-3 py-2 bg-blue-900/20 border border-blue-800 rounded text-xs text-blue-300">
          💡 <strong>Tip:</strong> Chat mode shows text output with status updates. For full interactive features (expandable cards, cursor positioning), use the <strong>Terminal</strong> tab.
        </div>
      </div>

      {/* Output Area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        style={{ minHeight: 0 }}
      >
        {messages.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-12">
            <p className="mb-2">💬 Chat interface ready</p>
            <p className="text-xs">Type your message below and press Enter to send.</p>
            <p className="text-xs text-gray-600 mt-1">This is a simplified view without terminal emulation.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${
              msg.type === 'input'
                ? 'bg-blue-900/30 border-l-4 border-blue-500'
                : 'bg-gray-800/50 border-l-4 border-gray-600'
            } px-4 py-3 rounded-lg shadow-sm`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-medium ${
                msg.type === 'input' ? 'text-blue-400' : 'text-gray-400'
              }`}>
                {msg.type === 'input' ? '👤 You' : '🤖 Claude'}
              </span>
              <span className="text-xs text-gray-500">
                {msg.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <div className="text-gray-200 text-sm font-mono whitespace-pre-wrap break-words leading-relaxed">
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-700 bg-gray-800 p-4 flex-shrink-0">
        {!isConnected && (
          <div className="mb-3 px-3 py-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-400">
            ⚠️ Not connected to session. Waiting for connection...
          </div>
        )}
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            className="flex-1 bg-gray-900 text-gray-200 text-sm rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700"
            rows={3}
            disabled={!isConnected}
          />
          <button
            onClick={handleSend}
            disabled={!isConnected || !input.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
          >
            Send
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          <span className="inline-block mr-4">Enter = Send</span>
          <span className="inline-block mr-4">Shift+Enter = New Line</span>
          <span className="inline-block">Cmd+K/Ctrl+K = Clear (coming soon)</span>
        </div>
      </div>
    </div>
  )
}

// Comprehensive ANSI and terminal control code stripper
function stripAnsi(text: string): string {
  return text
    // Remove ANSI escape codes
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    // Remove other escape sequences
    .replace(/\x1B[@-_][0-?]*[ -/]*[@-~]/g, '')
    // Remove OSC (Operating System Command) sequences
    .replace(/\x1B\][^\x07]*\x07/g, '')
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
}

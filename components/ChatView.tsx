'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { Session } from '@/types/session'

interface ChatViewProps {
  session: Session
  isVisible?: boolean
}

export default function ChatView({ session, isVisible = true }: ChatViewProps) {
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const outputRef = useRef<HTMLPreElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { isConnected, sendMessage } = useWebSocket({
    sessionId: session.id,
    hostId: session.hostId,
    autoConnect: isVisible,
    onMessage: (data) => {
      // Strip ANSI codes
      const cleaned = stripAnsi(data)

      setOutput(prev => {
        // Handle carriage returns - they overwrite the current line
        if (cleaned.includes('\r')) {
          // Split by carriage return
          const parts = cleaned.split('\r')

          // For each part with \r, replace the last line
          let result = prev
          for (let i = 0; i < parts.length - 1; i++) {
            // Find the last newline in current result
            const lastNewlineIndex = result.lastIndexOf('\n')
            // Remove everything after the last newline (current line)
            result = result.substring(0, lastNewlineIndex + 1)
            // Add the new content (if any)
            if (parts[i]) {
              result += parts[i]
            }
          }
          // Add the final part (no \r after it)
          result += parts[parts.length - 1]
          return result
        }

        // Normal append
        return prev + cleaned
      })
    },
  })

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

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

    // Add user input to output display
    setOutput(prev => prev + '\n> ' + input + '\n')

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

  const handleClearOutput = () => {
    setOutput('')
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800 flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="text-sm font-medium text-gray-200">Plain Text Output</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'} • Raw WebSocket stream
          </p>
        </div>
        <button
          onClick={handleClearOutput}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          title="Clear all output"
        >
          Clear
        </button>
      </div>

      {/* Output Area - Plain Text */}
      <pre
        ref={outputRef}
        className="flex-1 overflow-auto px-4 py-3 m-0 text-xs text-gray-200 font-mono bg-black/30"
        style={{ minHeight: 0 }}
      >
        {output || '(No output yet - send a message to start)'}
      </pre>

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

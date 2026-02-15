'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { SendHorizontal, ChevronDown, ChevronRight, Loader2, Wrench, Copy, Check } from 'lucide-react'

interface MobileChatViewProps {
  agentId: string
  agentName: string
}

interface ChatMessage {
  type: string
  uuid?: string
  timestamp?: string
  thinking?: string
  message?: {
    role?: string
    content?: string | Array<{
      type: string
      text?: string
      name?: string
      input?: { command?: string; file_path?: string; pattern?: string; query?: string }
      thinking?: string
    }>
  }
}

interface ChatAPIResponse {
  success: boolean
  messages: ChatMessage[]
  hookState?: {
    status?: string
    updatedAt?: string
  }
  terminalPrompt?: string | null
  promptType?: 'permission' | 'input' | null
  lastModified?: string
}

// Copy button with checkmark feedback
function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded-md transition-colors ${
        copied
          ? 'bg-green-600/20 text-green-400'
          : 'bg-gray-700/50 text-gray-400 hover:text-gray-200 active:bg-gray-600/50'
      } ${className}`}
      aria-label={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// Code block with copy button
function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group my-1">
      <div className="absolute top-1 right-1 z-10">
        <CopyButton text={code} />
      </div>
      <pre className="bg-gray-900 rounded-md px-3 py-2 pr-9 overflow-x-auto text-xs font-mono text-gray-200 select-text">
        {code}
      </pre>
    </div>
  )
}

// Lightweight markdown renderer
function renderMarkdown(text: string): JSX.Element {
  const lines = text.split('\n')
  const elements: JSX.Element[] = []
  let inCodeBlock = false
  let codeLines: string[] = []
  let codeKey = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const code = codeLines.join('\n')
        elements.push(<CodeBlock key={`code-${codeKey++}`} code={code} />)
        codeLines = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // List items
    if (line.match(/^[-*]\s/)) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-2">
          <span className="text-gray-500 flex-shrink-0">&#x2022;</span>
          <span>{renderInline(line.replace(/^[-*]\s/, ''))}</span>
        </div>
      )
      continue
    }

    // Regular line
    if (line.trim()) {
      elements.push(
        <p key={i} className="whitespace-pre-wrap">
          {renderInline(line)}
        </p>
      )
    } else {
      elements.push(<div key={i} className="h-2" />)
    }
  }

  // Close unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    const code = codeLines.join('\n')
    elements.push(<CodeBlock key={`code-${codeKey}`} code={code} />)
  }

  return <>{elements}</>
}

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  // Match bold, inline code, or plain text
  const regex = /(\*\*(.+?)\*\*)|(`([^`]+?)`)/g
  let lastIndex = 0
  let match
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={key++}>{match[2]}</strong>)
    } else if (match[4]) {
      parts.push(
        <code key={key++} className="bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-blue-300">
          {match[4]}
        </code>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts
}

// Extract display text from a message
function extractText(msg: ChatMessage): string {
  const content = msg.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text!)
      .join('\n')
  }
  return ''
}

// Extract tool use info from a message
function extractToolUses(msg: ChatMessage): { name: string; target: string }[] {
  const content = msg.message?.content
  if (!Array.isArray(content)) return []
  return content
    .filter(b => b.type === 'tool_use' && b.name)
    .map(b => {
      const target = b.input?.file_path || b.input?.command || b.input?.pattern || b.input?.query || ''
      const shortTarget = target.length > 60 ? '...' + target.slice(-57) : target
      return { name: b.name!, target: shortTarget }
    })
}

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = text.slice(0, 80) + (text.length > 80 ? '...' : '')

  return (
    <div
      className="mx-3 my-1 px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700/50 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="italic">Thinking</span>
      </div>
      {expanded ? (
        <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap select-text">{text}</p>
      ) : (
        <p className="text-xs text-gray-500 mt-0.5 truncate">{preview}</p>
      )}
    </div>
  )
}

export default function MobileChatView({ agentId, agentName }: MobileChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hookState, setHookState] = useState<ChatAPIResponse['hookState']>(undefined)
  const [terminalPrompt, setTerminalPrompt] = useState<string | null>(null)
  const [promptType, setPromptType] = useState<ChatAPIResponse['promptType']>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const burstTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/chat?limit=50`)
      if (!res.ok) {
        setError('Failed to fetch messages')
        return
      }
      const data: ChatAPIResponse = await res.json()
      if (data.success) {
        setMessages(data.messages)
        setHookState(data.hookState)
        setTerminalPrompt(data.terminalPrompt ?? null)
        setPromptType(data.promptType ?? null)
        setError(null)
      }
    } catch {
      setError('Connection error')
    }
  }, [agentId])

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length])

  // Polling with visibility API
  useEffect(() => {
    fetchMessages()

    const startPolling = () => {
      pollTimerRef.current = setInterval(fetchMessages, 3000)
    }

    const stopPolling = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        fetchMessages()
        startPolling()
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPolling()
      burstTimersRef.current.forEach(t => clearTimeout(t))
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchMessages])

  // Send message
  const sendMessage = async () => {
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setInput('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      if (!res.ok) {
        setError('Failed to send message')
      } else {
        // Burst re-polls to catch the response as soon as it's written
        // Poll at 0.5s, 1s, 2s, 4s, 8s, 15s, 25s after send
        burstTimersRef.current.forEach(t => clearTimeout(t))
        burstTimersRef.current = [500, 1000, 2000, 4000, 8000, 15000, 25000].map(
          delay => setTimeout(fetchMessages, delay)
        )
      }
    } catch {
      setError('Failed to send')
    } finally {
      setSending(false)
    }
  }

  // Send quick response (for permission prompts)
  const sendQuickResponse = async (text: string) => {
    setSending(true)
    try {
      await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      setTimeout(fetchMessages, 500)
    } catch {
      setError('Failed to send')
    } finally {
      setSending(false)
    }
  }

  // Auto-grow textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 96) + 'px' // max ~4 lines
  }

  // Enter to send, Shift+Enter for newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Determine status
  const isWaiting = hookState?.status === 'waiting_for_input' || promptType === 'input'
  const isPermission = promptType === 'permission'
  const isWorking = !isWaiting && !isPermission && messages.length > 0

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-1 py-2" style={{ minHeight: 0 }}>
        {messages.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Conversation will appear here</p>
          </div>
        )}

        {error && (
          <div className="mx-3 my-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-800/50">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const key = msg.uuid ? `${msg.uuid}-${i}` : `msg-${i}`

          // Thinking block
          if (msg.type === 'thinking' && msg.thinking) {
            return <ThinkingBlock key={key} text={msg.thinking} />
          }

          // Human message
          if (msg.type === 'human') {
            const text = extractText(msg)
            if (!text) return null
            return (
              <div key={key} className="flex justify-end mx-3 my-1.5">
                <div className="max-w-[85%]">
                  <div className="px-3 py-2 rounded-2xl rounded-br-sm bg-blue-600 text-white text-sm select-text">
                    <p className="whitespace-pre-wrap">{text}</p>
                  </div>
                  <div className="flex justify-end mt-0.5 mr-1">
                    <CopyButton text={text} className="text-gray-500" />
                  </div>
                </div>
              </div>
            )
          }

          // Assistant message
          if (msg.type === 'assistant') {
            const text = extractText(msg)
            const tools = extractToolUses(msg)

            // Tool-only message (no text content)
            if (!text && tools.length > 0) {
              return (
                <div key={key} className="mx-3 my-1">
                  {tools.map((tool, j) => (
                    <div key={j} className="flex items-center gap-1.5 text-xs text-gray-500 italic py-0.5">
                      <Wrench className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">
                        Used <span className="text-gray-400">{tool.name}</span>
                        {tool.target && <span className="text-gray-600"> on {tool.target}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )
            }

            // Text message (may also include tools)
            if (text) {
              return (
                <div key={key} className="mx-3 my-1.5">
                  {tools.length > 0 && (
                    <div className="mb-1">
                      {tools.map((tool, j) => (
                        <div key={j} className="flex items-center gap-1.5 text-xs text-gray-500 italic py-0.5">
                          <Wrench className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">
                            Used <span className="text-gray-400">{tool.name}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="max-w-[90%] relative">
                    <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-gray-800 text-gray-200 text-sm select-text">
                      {renderMarkdown(text)}
                    </div>
                    <div className="flex justify-end mt-0.5 mr-1">
                      <CopyButton text={text} />
                    </div>
                  </div>
                </div>
              )
            }

            return null
          }

          // Result messages (tool results) - skip rendering, context is in assistant messages
          return null
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 border-t border-gray-800">
        {isPermission && terminalPrompt && (
          <div className="px-3 py-2 bg-yellow-900/20 border-b border-yellow-800/50">
            <p className="text-xs text-yellow-300 mb-2 whitespace-pre-wrap">{terminalPrompt}</p>
            <div className="flex gap-2">
              <button
                onClick={() => sendQuickResponse('y')}
                disabled={sending}
                className="px-4 py-1.5 text-xs font-medium rounded-md bg-green-700 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
              >
                Yes
              </button>
              <button
                onClick={() => sendQuickResponse('n')}
                disabled={sending}
                className="px-4 py-1.5 text-xs font-medium rounded-md bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
              >
                No
              </button>
            </div>
          </div>
        )}

        {!isPermission && (
          <div className="px-3 py-1.5 flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isWaiting ? 'bg-green-500' : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span className="text-xs text-gray-400">
              {isWaiting ? 'Ready for input' : isWorking ? 'Working...' : 'Idle'}
            </span>
            {isWorking && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-gray-800 bg-gray-950 px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agentName}...`}
            rows={1}
            className="flex-1 bg-gray-800 text-gray-200 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
            style={{ maxHeight: '96px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 p-2 rounded-xl bg-blue-600 text-white disabled:opacity-30 disabled:bg-gray-700 transition-colors"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <SendHorizontal className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

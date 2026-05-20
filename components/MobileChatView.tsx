'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { SendHorizontal, ChevronDown, ChevronRight, Loader2, Wrench, Copy, Check } from 'lucide-react'

interface MobileChatViewProps {
  agentId: string
  agentName: string
  sessionName?: string  // tmux session name for WebSocket (falls back to agentName)
  hostId?: string       // Host ID for remote agent routing (e.g., 'mac-mini')
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
  // For queue-operation type
  operation?: 'enqueue' | 'dequeue'
  content?: string
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
    <div className="relative group my-1 overflow-hidden">
      <div className="absolute top-1 right-1 z-10">
        <CopyButton text={code} />
      </div>
      <pre className="bg-gray-900 rounded-md px-3 py-2 pr-9 overflow-x-auto max-w-full text-xs font-mono text-gray-200 select-text">
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
        <p key={i} className="whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>
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
  // Handle queue-operation (enqueued user messages)
  if (msg.type === 'queue-operation' && msg.content) {
    return msg.content
  }
  return ''
}

// Shorten a file path to last 3 segments
function shortenPath(p: string): string {
  const parts = p.split('/')
  if (parts.length <= 3) return p
  return '.../' + parts.slice(-3).join('/')
}

// Get a tool-specific preview string
function getToolPreviewText(name: string, input: any): string {
  if (!input) return ''
  switch (name) {
    case 'Bash':
      return (input.command || '').slice(0, 60) + ((input.command?.length || 0) > 60 ? '...' : '')
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit':
      return input.file_path ? shortenPath(input.file_path) : ''
    case 'Glob':
      return input.pattern || ''
    case 'Grep':
      return `/${input.pattern || ''}/${input.path ? ' ' + shortenPath(input.path) : ''}`
    case 'Task':
      return (input.description || '').slice(0, 60)
    case 'WebSearch':
      return input.query || ''
    case 'WebFetch':
      return input.url || ''
    default: {
      const keys = Object.keys(input)
      if (keys.length === 0) return ''
      const k = keys[0]
      const v = typeof input[k] === 'string' ? input[k] : JSON.stringify(input[k])
      const preview = `${k}: ${v}`
      return preview.slice(0, 60) + (preview.length > 60 ? '...' : '')
    }
  }
}

// Extract tool use info from a message
function extractToolUses(msg: ChatMessage): { name: string; preview: string }[] {
  const content = msg.message?.content
  if (!Array.isArray(content)) return []
  return content
    .filter(b => b.type === 'tool_use' && b.name)
    .map(b => ({
      name: b.name!,
      preview: getToolPreviewText(b.name!, b.input)
    }))
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
        <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap select-text max-h-48 overflow-y-auto">{text}</p>
      ) : (
        <p className="text-xs text-gray-500 mt-0.5 truncate">{preview}</p>
      )}
    </div>
  )
}

export default function MobileChatView({ agentId, agentName, sessionName: sessionNameProp, hostId }: MobileChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hookState, setHookState] = useState<{
    status?: string;
    description?: string;
    message?: string;
    toolName?: string;
    toolInput?: {
      command?: string;
      file_path?: string;
      path?: string;
      [key: string]: any;
    };
    options?: Array<{
      key: string;
      label: string;
      action: string;
    }>;
    updatedAt?: string;
  } | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingMessages, setPendingMessages] = useState<Array<{ text: string; timestamp: string }>>([])

  const [chatWsConnected, setChatWsConnected] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevLastMsgIdRef = useRef<string | null>(null)
  const lastPongRef = useRef<number>(Date.now())
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
  const reconnectAttemptsRef = useRef(0)

  // The session name to use for the WebSocket URL
  const wsSessionName = sessionNameProp || agentName

  // ── WebSocket connection for chat ─────────────────────────────────
  const getChatWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    let url = `${protocol}//${host}/term?name=${encodeURIComponent(wsSessionName)}&chatOnly=1`
    if (hostId && hostId !== 'local') {
      url += `&host=${encodeURIComponent(hostId)}`
    }
    return url
  }, [wsSessionName, hostId])

  const sendChatWs = useCallback((type: string, payload?: Record<string, any>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...payload }))
      return true
    }
    return false
  }, [])

  // Connect WebSocket on mount
  useEffect(() => {
    if (!agentId) return

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return
      // Close zombie sockets stuck in CONNECTING
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close()
        wsRef.current = null
      }

      const ws = new WebSocket(getChatWsUrl())

      ws.onopen = () => {
        console.log(`[MobileChatView] Connected to chat WS for ${wsSessionName}`)
        setChatWsConnected(true)
        reconnectAttemptsRef.current = 0
        ws.send(JSON.stringify({ type: 'chat:requestHistory', agentId }))
        setError(null)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case 'chat:history': {
              const history = data.data || {}
              setMessages(history.messages || [])
              setHookState(history.hookState || null)
              break
            }

            case 'chat:messages': {
              const newMsgs = data.data || []
              if (newMsgs.length > 0) {
                setMessages(prev => {
                  const existingUuids = new Set(prev.map(m => m.uuid).filter(Boolean))
                  const uniqueNew = newMsgs.filter((m: ChatMessage) =>
                    !m.uuid || !existingUuids.has(m.uuid)
                  )
                  if (uniqueNew.length === 0) return prev
                  return [...prev, ...uniqueNew].slice(-200)
                })
                setPendingMessages([])
              }
              break
            }

            case 'chat:hookState': {
              setHookState(data.data || null)
              // Don't clear pending here — let chat:messages confirm with content match
              break
            }

            case 'chat:sent': {
              // Server confirmed delivery to PTY — keep pending visible
              // until chat:messages arrives with the user message from JSONL
              break
            }

            case 'pong': {
              lastPongRef.current = Date.now()
              break
            }

            case 'chat:error': {
              setError(data.error || 'Unknown error')
              break
            }
          }
        } catch {
          // Not JSON — ignore
        }
      }

      ws.onclose = () => {
        setChatWsConnected(false)
        // Guard against stale closures
        if (wsRef.current !== ws) return
        wsRef.current = null

        // Auto-reconnect with backoff
        if (reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current++
          reconnectTimeoutRef.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        // onclose will fire after — reconnect handled there
      }

      wsRef.current = ws
    }

    connect()

    // Reconnect on visibility change (mobile tab switching / background recovery)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttemptsRef.current = 0
          if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
            wsRef.current.close()
          }
        }
      } else {
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      setChatWsConnected(false)
    }
  }, [agentId, wsSessionName, getChatWsUrl])

  // Heartbeat: send ping every 15s, force reconnect if no pong for 45s
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        if (Date.now() - lastPongRef.current > 45000) {
          console.log('[MobileChatView] No pong in 45s — forcing reconnect')
          wsRef.current.close()
          return
        }
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll when new messages or pending messages arrive
  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    const lastId = lastMsg?.uuid || lastMsg?.timestamp || null
    const hasNewMessages = lastId !== prevLastMsgIdRef.current
    prevLastMsgIdRef.current = lastId

    if (hasNewMessages || pendingMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, pendingMessages])

  // Send message via WebSocket
  const sendMessage = () => {
    const text = input.trim()
    if (!text || sending) return

    // Check connection BEFORE clearing input
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected — reconnecting...')
      reconnectAttemptsRef.current = 0
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close()
      }
      return
    }

    setSending(true)
    setInput('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    const pendingMsg = { text, timestamp: new Date().toISOString() }
    setPendingMessages(prev => [...prev, pendingMsg])

    const sent = sendChatWs('chat:send', { message: text })
    if (!sent) {
      setError('Failed to send — try again')
      setPendingMessages(prev => prev.filter(p => p.timestamp !== pendingMsg.timestamp))
      setInput(text)
    }

    setSending(false)
  }

  // Send quick response (for permission prompts)
  const sendQuickResponse = (text: string) => {
    setSending(true)
    const pendingMsg = { text, timestamp: new Date().toISOString() }
    setPendingMessages(prev => [...prev, pendingMsg])

    const sent = sendChatWs('chat:send', { message: text })
    if (!sent) {
      setError('Not connected')
      setPendingMessages(prev => prev.filter(p => p.timestamp !== pendingMsg.timestamp))
    }
    setSending(false)
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
  const isPermission = hookState?.status === 'permission_request'
  const isWaiting = hookState?.status === 'waiting_for_input'
  const isWorking = pendingMessages.length > 0 || (messages.length > 0 && !isWaiting && !isPermission &&
    (messages[messages.length - 1]?.type === 'user' || messages[messages.length - 1]?.type === 'human'))

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

          // Summary divider
          if (msg.type === 'summary') {
            return (
              <div key={key} className="flex items-center gap-3 my-2 mx-3">
                <div className="flex-1 border-t border-gray-700/50" />
                <span className="text-xs text-gray-500 italic whitespace-nowrap">
                  {(msg as any).summary || 'Conversation compacted'}
                </span>
                <div className="flex-1 border-t border-gray-700/50" />
              </div>
            )
          }

          // Human/user message
          if (msg.type === 'human' || msg.type === 'user') {
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

          // Queue-operation (enqueued user messages)
          if (msg.type === 'queue-operation' && msg.operation === 'enqueue') {
            const text = extractText(msg)
            if (!text) return null
            return (
              <div key={key} className="flex justify-end mx-3 my-1.5">
                <div className="max-w-[85%]">
                  <div className="px-3 py-2 rounded-2xl rounded-br-sm bg-yellow-600/80 text-white text-sm border border-yellow-500 select-text">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-xs opacity-70">Queued</span>
                    </div>
                    <p className="whitespace-pre-wrap">{text}</p>
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
                        <span className="text-gray-400">{tool.name}</span>
                        {tool.preview && <span className="text-gray-600 font-mono"> {tool.preview}</span>}
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
                  <div className="max-w-[90%] min-w-0 overflow-hidden relative">
                    <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-gray-800 text-gray-200 text-sm select-text overflow-hidden">
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

          // Result messages (tool results) - skip rendering
          return null
        })}

        {/* Pending messages */}
        {pendingMessages.map((pending, idx) => (
          <div key={`pending-${idx}`} className="flex justify-end mx-3 my-1.5">
            <div className="max-w-[85%]">
              <div className="px-3 py-2 rounded-2xl rounded-br-sm bg-blue-600/70 text-white text-sm border border-blue-500/50 select-text">
                <div className="flex items-center gap-1.5 mb-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-xs opacity-70">Sending...</span>
                </div>
                <p className="whitespace-pre-wrap">{pending.text}</p>
              </div>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 border-t border-gray-800">
        {isPermission && (
          <div className="px-3 py-2 bg-yellow-900/20 border-b border-yellow-800/50">
            <p className="text-xs text-yellow-300 mb-2">
              {hookState?.description || hookState?.message || `Allow ${hookState?.toolName || 'action'}?`}
            </p>
            {hookState?.toolName === 'Bash' && hookState?.toolInput?.command && (
              <pre className="text-xs bg-gray-950/50 p-2 rounded font-mono overflow-x-auto max-h-20 overflow-y-auto mb-2 text-gray-300">
                {hookState.toolInput.command}
              </pre>
            )}
            {hookState?.toolName !== 'Bash' && (hookState?.toolInput?.file_path || hookState?.toolInput?.path) && (
              <div className="text-xs opacity-80 font-mono bg-gray-950/30 px-2 py-1 rounded mb-2 text-gray-300 truncate">
                {hookState.toolInput.file_path || hookState.toolInput.path}
              </div>
            )}
            {hookState?.options && hookState.options.length > 0 ? (
              <div className="space-y-1.5">
                {hookState.options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendQuickResponse(option.key)}
                    disabled={sending}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg
                      bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/30
                      hover:border-amber-500/50 transition-all disabled:opacity-50"
                  >
                    <span className="text-amber-400 font-bold w-5 text-center">{option.key}</span>
                    <span className="text-amber-200 text-sm flex-1">{option.label}</span>
                  </button>
                ))}
              </div>
            ) : (
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
            )}
          </div>
        )}

        {!isPermission && (
          <div className="px-3 py-1.5 flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isWaiting ? 'bg-green-500' : isWorking ? 'bg-amber-500 animate-pulse' : 'bg-gray-500'
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
        {!chatWsConnected && (
          <div className="mb-2 px-2 py-1.5 bg-yellow-900/20 border border-yellow-800/50 rounded-lg text-xs text-yellow-400 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Reconnecting...
          </div>
        )}
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

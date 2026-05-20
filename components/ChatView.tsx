'use client'

import { useEffect, useRef, useState, useCallback, useMemo, type KeyboardEvent, type ChangeEvent } from 'react'
import { User, Bot, Wrench, Loader2, Send, RefreshCw, AlertCircle, ChevronDown, ChevronRight, Copy, Check, MessageSquare, ScanEye, Brain, X } from 'lucide-react'
import { MarkdownContent } from '@/components/chat/MarkdownRenderer'
import type { Agent } from '@/types/agent'

// Collapsible thinking block
function ThinkingBlock({ text, timestamp }: { text: string; timestamp?: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = text.slice(0, 120) + (text.length > 120 ? '...' : '')

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div
          className="rounded-2xl px-4 py-3 bg-purple-900/20 border border-purple-700/30 cursor-pointer transition-colors hover:bg-purple-900/30"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2 mb-1">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-purple-400" />
            )}
            <span className="text-xs text-purple-400 italic">Thinking</span>
            {timestamp && (
              <span className="text-xs text-purple-500/50 ml-auto">
                {new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {expanded ? (
            <div className="text-sm text-purple-200/80 whitespace-pre-wrap italic max-h-64 overflow-y-auto select-text">
              {text}
            </div>
          ) : (
            <p className="text-sm text-purple-300/50 truncate italic">{preview}</p>
          )}
        </div>
      </div>
    </div>
  )
}

type ChatMode = 'power' | 'assisted'

interface ChatViewProps {
  agent: Agent
  isActive?: boolean  // Only connect WebSocket when active (prevents resource waste with many agents)
}

interface Message {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'thinking' | 'summary' | 'system' | 'queue-operation'
  timestamp?: string
  uuid?: string
  message?: {
    content?: string | ContentBlock[]
    model?: string
  }
  thinking?: string
  summary?: string
  toolName?: string
  toolInput?: any
  // For queue-operation type
  operation?: 'enqueue' | 'dequeue'
  content?: string
}

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: any
  id?: string
  [key: string]: any
}

export default function ChatView({ agent, isActive = false }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [pendingMessages, setPendingMessages] = useState<Array<{ text: string; timestamp: string }>>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastModified, setLastModified] = useState<string | null>(null)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [memorizeTarget, setMemorizeTarget] = useState<{ index: number; content: string } | null>(null)
  const [memorizeNote, setMemorizeNote] = useState('')
  const [hookState, setHookState] = useState<{
    status: string;
    message?: string;
    description?: string;
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
      rule?: string;
    }>;
    notificationType?: string;
    updatedAt?: string;
  } | null>(null)
  const [chatMode, setChatMode] = useState<ChatMode>(() => {
    if (typeof window === 'undefined') return 'assisted'
    return (localStorage.getItem('aimaestro-chat-mode') as ChatMode) || 'assisted'
  })
  const [chatWsConnected, setChatWsConnected] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
  const reconnectAttemptsRef = useRef(0)

  // Track if we've done initial load
  const hasLoadedRef = useRef(false)
  // Track last message ID for scroll behavior
  const prevLastMsgIdRef = useRef<string | null>(null)
  // Track last pong for dead connection detection
  const lastPongRef = useRef<number>(Date.now())

  // Persist chat mode
  const toggleChatMode = () => {
    const next = chatMode === 'power' ? 'assisted' : 'power'
    setChatMode(next)
    localStorage.setItem('aimaestro-chat-mode', next)
  }

  // ── WebSocket connection for chat ─────────────────────────────────
  const getChatWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const sessionName = agent.name || agent.alias || agent.id
    let url = `${protocol}//${host}/term?name=${encodeURIComponent(sessionName)}&chatOnly=1`
    // Route through remote host proxy when agent lives on a different machine
    if (agent.hostId && agent.hostId !== 'local') {
      url += `&host=${encodeURIComponent(agent.hostId)}`
    }
    return url
  }, [agent.name, agent.alias, agent.id, agent.hostId])

  const sendChatMessage = useCallback((type: string, payload?: Record<string, any>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...payload }))
      return true
    }
    return false
  }, [])

  // Request history (used for initial load + manual refresh)
  const requestHistory = useCallback(() => {
    setIsLoading(true)
    sendChatMessage('chat:requestHistory', { agentId: agent.id })
  }, [sendChatMessage, agent.id])

  // Connect/disconnect WebSocket based on isActive
  useEffect(() => {
    if (!isActive || !agent?.id) return

    const sessionName = agent.name || agent.alias || agent.id

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return
      // Close zombie sockets stuck in CONNECTING
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close()
        wsRef.current = null
      }

      const ws = new WebSocket(getChatWsUrl())

      ws.onopen = () => {
        console.log(`[ChatView] Connected to chat WS for ${sessionName}`)
        setChatWsConnected(true)
        reconnectAttemptsRef.current = 0
        // Request history on connect
        ws.send(JSON.stringify({ type: 'chat:requestHistory', agentId: agent.id }))
        setIsLoading(true)
        setError(null)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case 'chat:history': {
              const history = data.data || {}
              const newMessages = history.messages || []
              setMessages(newMessages)
              setHookState(history.hookState || null)
              setLastModified(history.lastModified || null)
              // Only clear pending on initial load (server history includes sent msgs)
              if (!hasLoadedRef.current) {
                setPendingMessages([])
              }
              hasLoadedRef.current = true
              setIsLoading(false)
              break
            }

            case 'chat:messages': {
              // Incremental new messages from JSONL watcher (only fires on real file changes)
              const newMsgs = data.data || []
              if (newMsgs.length > 0) {
                let hadNew = false
                setMessages(prev => {
                  // Deduplicate by uuid/timestamp
                  const existingUuids = new Set(prev.map(m => m.uuid).filter(Boolean))
                  const uniqueNew = newMsgs.filter((m: Message) =>
                    !m.uuid || !existingUuids.has(m.uuid)
                  )
                  if (uniqueNew.length === 0) return prev
                  hadNew = true
                  return [...prev, ...uniqueNew].slice(-200) // Keep last 200
                })
                // Any genuinely new messages means the agent moved past our input.
                // Safe to clear because chat:messages only fires on JSONL file changes
                // (no polling), so this won't prematurely wipe pending bubbles.
                if (hadNew) {
                  setPendingMessages([])
                }
              }
              break
            }

            case 'chat:hookState': {
              // Real-time hook state update (permission requests, status changes)
              const newState = data.data || null
              setHookState(newState)
              // Don't clear pending here — let chat:messages confirm with content match
              break
            }

            case 'chat:sent': {
              // Server confirmed message was written to PTY — keep pending visible
              // until we see the user message appear in chat:messages (JSONL watcher)
              // Don't clear on a timer; let chat:messages handle it
              break
            }

            case 'pong': {
              lastPongRef.current = Date.now()
              break
            }

            case 'chat:error': {
              setError(data.error || 'Unknown error')
              setIsLoading(false)
              break
            }
          }
        } catch {
          // Not JSON — ignore (shouldn't happen on chatOnly connection)
        }
      }

      ws.onclose = () => {
        console.log(`[ChatView] Chat WS disconnected for ${sessionName}`)
        setChatWsConnected(false)
        // Guard against stale closures
        if (wsRef.current !== ws) return
        wsRef.current = null

        // Auto-reconnect with backoff (up to 5 attempts)
        if (reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current++
          reconnectTimeoutRef.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        // onclose will fire after this — reconnect handled there
      }

      wsRef.current = ws
    }

    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      setChatWsConnected(false)
    }
  }, [agent?.id, agent?.name, agent?.alias, isActive, getChatWsUrl])

  // Reconnect chat WS when page becomes visible (mobile background recovery)
  useEffect(() => {
    if (!isActive) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttemptsRef.current = 0 // Reset for fresh retries
          // Trigger reconnect by closing any zombie socket
          if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
            wsRef.current.close()
          }
        }
      } else {
        // Page hidden — cancel pending reconnects
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isActive])

  // Heartbeat: send ping every 15s, force reconnect if no pong for 45s
  useEffect(() => {
    if (!isActive) return

    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // If no pong received in 45s, connection is dead — force reconnect
        if (Date.now() - lastPongRef.current > 45000) {
          console.log('[ChatView] No pong in 45s — forcing reconnect')
          wsRef.current.close() // triggers onclose → reconnect
          return
        }
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 15000)

    return () => clearInterval(interval)
  }, [isActive])

  // Auto-scroll to bottom when new messages or pending messages arrive
  useEffect(() => {
    if (messages.length === 0 && pendingMessages.length === 0) return

    const lastMsg = messages[messages.length - 1]
    const lastId = lastMsg?.uuid || lastMsg?.timestamp || null
    const isInitialLoad = prevLastMsgIdRef.current === null
    const hasNewMessages = lastId !== prevLastMsgIdRef.current
    prevLastMsgIdRef.current = lastId

    // Scroll on initial load (instant) or new messages/pending messages (smooth)
    if (isInitialLoad) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    } else if (hasNewMessages || pendingMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, pendingMessages])

  // Auto-scroll when permission prompt appears
  useEffect(() => {
    if (hookState?.status === 'permission_request') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [hookState])

  // Send quick response (assisted mode — for permission buttons)
  const sendQuickResponse = (text: string) => {
    setIsSending(true)

    // Show pending bubble so user sees their click did something
    const pendingMsg = { text, timestamp: new Date().toISOString() }
    setPendingMessages(prev => [...prev, pendingMsg])

    const sent = sendChatMessage('chat:send', { message: text })
    if (!sent) {
      setError('Not connected — try refreshing')
      setPendingMessages(prev => prev.filter(p => p.timestamp !== pendingMsg.timestamp))
    }

    setIsSending(false)
  }

  // Send message via WebSocket
  const handleSend = () => {
    if (!input.trim() || isSending) return

    const messageToSend = input.trim()

    // Check connection BEFORE clearing input — don't lose the user's text
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected — reconnecting...')
      reconnectAttemptsRef.current = 0
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close()
      }
      return
    }

    setInput('')
    setIsSending(true)

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    // Add to pending messages immediately for instant feedback
    const pendingMsg = { text: messageToSend, timestamp: new Date().toISOString() }
    setPendingMessages(prev => [...prev, pendingMsg])

    const sent = sendChatMessage('chat:send', { message: messageToSend })
    if (!sent) {
      setError('Failed to send — try again')
      setPendingMessages(prev => prev.filter(p => p.timestamp !== pendingMsg.timestamp))
      setInput(messageToSend)
    }

    setIsSending(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-growing textarea
  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const toggleTool = (toolId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev)
      if (next.has(toolId)) {
        next.delete(toolId)
      } else {
        next.add(toolId)
      }
      return next
    })
  }

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getMessageContent = (message: Message): string => {
    if (message.thinking) return message.thinking
    if (message.summary) return message.summary

    // Handle queue-operation (enqueued user messages)
    if (message.type === 'queue-operation' && message.content) {
      return message.content
    }

    const content = message.message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text)
        .join('\n\n')
    }
    return ''
  }

  const getToolsFromMessage = (message: Message): ContentBlock[] => {
    const content = message.message?.content
    if (!Array.isArray(content)) return []
    return content.filter(block => block.type === 'tool_use')
  }

  // Shorten a file path to last 3 segments
  const shortenPath = (p: string): string => {
    const parts = p.split('/')
    if (parts.length <= 3) return p
    return '.../' + parts.slice(-3).join('/')
  }

  // Get a one-line contextual preview for a tool
  const getToolPreview = (tool: ContentBlock): string => {
    const input = tool.input
    if (!input) return ''
    const name = tool.name || ''

    switch (name) {
      case 'Bash':
        return (input.command || '').slice(0, 80) + ((input.command?.length || 0) > 80 ? '...' : '')
      case 'Read':
      case 'Write':
      case 'Edit':
      case 'MultiEdit':
        return input.file_path ? shortenPath(input.file_path) : ''
      case 'Glob':
        return input.pattern || ''
      case 'Grep':
        return `/${input.pattern || ''}/${input.path ? ' ' + shortenPath(input.path) : ''}`
      case 'Task':
        return (input.description || '').slice(0, 80)
      case 'WebSearch':
        return input.query || ''
      case 'WebFetch':
        return input.url || ''
      default: {
        // First key=value from input
        const keys = Object.keys(input)
        if (keys.length === 0) return ''
        const k = keys[0]
        const v = typeof input[k] === 'string' ? input[k] : JSON.stringify(input[k])
        const preview = `${k}: ${v}`
        return preview.slice(0, 80) + (preview.length > 80 ? '...' : '')
      }
    }
  }

  // Render tool-specific expanded content
  const renderToolExpanded = (tool: ContentBlock) => {
    const input = tool.input
    if (!input) return null
    const name = tool.name || ''

    switch (name) {
      case 'Bash':
        return (
          <div className="px-3 pb-3">
            <pre className="text-xs bg-gray-950/50 p-2 rounded whitespace-pre-wrap break-all max-h-48 overflow-y-auto font-mono text-green-300">
              {input.command || ''}
            </pre>
          </div>
        )
      case 'Read':
      case 'Write':
      case 'Edit':
      case 'MultiEdit':
        return (
          <div className="px-3 pb-3 space-y-1">
            {input.file_path && (
              <div className="text-xs font-mono bg-gray-950/50 px-2 py-1.5 rounded text-blue-300">
                {input.file_path}
              </div>
            )}
            {input.description && (
              <p className="text-xs text-gray-400 italic">{input.description}</p>
            )}
            {input.old_string && (
              <pre className="text-xs bg-red-950/30 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto text-red-300 border border-red-900/30">
                {input.old_string}
              </pre>
            )}
            {input.new_string && (
              <pre className="text-xs bg-green-950/30 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto text-green-300 border border-green-900/30">
                {input.new_string}
              </pre>
            )}
            {input.content && name === 'Write' && (
              <pre className="text-xs bg-gray-950/50 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto text-gray-300">
                {typeof input.content === 'string' ? input.content.slice(0, 500) + (input.content.length > 500 ? '\n...' : '') : ''}
              </pre>
            )}
          </div>
        )
      case 'Grep':
        return (
          <div className="px-3 pb-3">
            <div className="text-xs font-mono bg-gray-950/50 px-2 py-1.5 rounded text-yellow-300">
              /{input.pattern || ''}/{input.path ? ` in ${input.path}` : ''}
            </div>
          </div>
        )
      case 'Glob':
        return (
          <div className="px-3 pb-3">
            <div className="text-xs font-mono bg-gray-950/50 px-2 py-1.5 rounded text-yellow-300">
              {input.pattern || ''}
            </div>
          </div>
        )
      default:
        return (
          <div className="px-3 pb-3">
            <pre className="text-xs bg-gray-950/50 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto text-gray-300">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>
        )
    }
  }

  const isOnline = agent.sessions?.some(s => s.status === 'online')

  // Activity state derived from hookState + messages + pending
  const activityState = useMemo(() => {
    if (hookState?.status === 'permission_request') return 'permission' as const
    if (hookState?.status === 'waiting_for_input') return 'waiting' as const
    if (pendingMessages.length > 0 || isSending) return 'thinking' as const
    if (messages.length > 0) {
      const last = messages[messages.length - 1]
      if (last.type === 'user' || last.type === 'queue-operation') return 'thinking' as const
    }
    return 'idle' as const
  }, [hookState, pendingMessages.length, isSending, messages])

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-900">
      {/* Header with activity indicator */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            !isOnline ? 'bg-red-500'
            : activityState === 'thinking' ? 'bg-amber-400 animate-pulse'
            : activityState === 'permission' ? 'bg-red-400 animate-pulse'
            : activityState === 'waiting' ? 'bg-green-400'
            : 'bg-gray-500'
          }`} />
          <div>
            <h3 className="text-sm font-medium text-gray-200">
              {!isOnline ? 'Offline'
              : activityState === 'thinking' ? 'Agent is working...'
              : activityState === 'permission' ? 'Permission needed'
              : activityState === 'waiting' ? 'Ready for input'
              : agent.label || agent.name || agent.alias || 'Chat'}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {messages.length} messages
              {lastModified && ` \u00b7 ${formatTimestamp(lastModified)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Chat mode toggle */}
          <button
            onClick={toggleChatMode}
            className={`p-2 rounded-lg transition-colors ${
              chatMode === 'power'
                ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20'
                : 'text-gray-500 hover:bg-gray-700 hover:text-gray-300'
            }`}
            title={chatMode === 'power' ? 'X-Ray on — click to turn off' : 'X-Ray off — click to see thinking & tools'}
          >
            <ScanEye className="w-4 h-4" />
          </button>
          <button
            onClick={requestHistory}
            disabled={isLoading}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh messages"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: 0 }}>
        {isLoading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!isLoading && messages.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-base text-gray-400">Talk to {agent.label || agent.name || agent.alias || 'this agent'}</p>
            <p className="text-xs mt-1">Send instructions, approve permissions, or ask questions</p>
          </div>
        )}

        {messages.map((message, index) => {
          const isUser = message.type === 'user'
          const isQueued = message.type === 'queue-operation' && message.operation === 'enqueue'
          const isThinking = message.type === 'thinking'
          const isSummary = message.type === 'summary'
          const content = getMessageContent(message)
          const tools = getToolsFromMessage(message)

          // Skip system messages with no meaningful content
          if (message.type === 'system') return null

          // Skip empty messages and dequeue operations
          if (!content && tools.length === 0) return null
          if (message.type === 'queue-operation' && message.operation !== 'enqueue') return null

          // Assisted mode: only show user↔agent conversation (hide thinking, tools-only, summaries)
          if (chatMode === 'assisted') {
            if (isThinking || isSummary) return null
            // Skip tool-only assistant messages (no text content)
            if (message.type === 'assistant' && !content && tools.length > 0) return null
          }

          // Summary divider — centered horizontal rule with text (power mode only)
          if (isSummary) {
            return (
              <div key={message.uuid || index} className="flex items-center gap-3 my-3 px-2">
                <div className="flex-1 border-t border-gray-700/50" />
                <span className="text-xs text-gray-500 italic whitespace-nowrap">
                  {message.summary || 'Conversation compacted'}
                </span>
                <div className="flex-1 border-t border-gray-700/50" />
              </div>
            )
          }

          // Thinking block — collapsible (power mode only)
          if (isThinking) {
            return <ThinkingBlock key={message.uuid || index} text={content} timestamp={message.timestamp} />
          }

          // Message grouping: check if previous message is same role within 60s
          const prevMsg = index > 0 ? messages[index - 1] : null
          const isSameRole = prevMsg && (
            (isUser && prevMsg.type === 'user') ||
            (isQueued && prevMsg.type === 'queue-operation' && prevMsg.operation === 'enqueue') ||
            (!isUser && !isQueued && prevMsg.type === 'assistant')
          )
          const isGrouped = isSameRole && message.timestamp && prevMsg?.timestamp &&
            Math.abs(new Date(message.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()) < 60000

          return (
            <div
              key={message.uuid || index}
              className={`flex ${(isUser || isQueued) ? 'justify-end' : 'justify-start'} ${isGrouped ? '!mt-1' : ''}`}
            >
              <div className={`max-w-[85%] ${(isUser || isQueued) ? 'order-1' : ''}`}>
                {/* Message bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 ${
                    isQueued
                      ? 'bg-yellow-600/80 text-white border border-yellow-500'
                      : isUser
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-200'
                  }`}
                >
                  {/* Header with icon — hide if grouped */}
                  {!isGrouped && (
                    <div className="flex items-center gap-2 mb-1">
                      {isQueued ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isUser ? (
                        <User className="w-3.5 h-3.5" />
                      ) : (
                        <Bot className="w-3.5 h-3.5" />
                      )}
                      <span className="text-xs opacity-70">
                        {isQueued ? 'Queued' : isUser ? 'You' : (agent.label || agent.name || 'Agent')}
                      </span>
                      {message.timestamp && (
                        <span className="text-xs opacity-50 ml-auto">
                          {formatTimestamp(message.timestamp)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Content — use markdown for assistant, plain for user */}
                  {content && (
                    (isUser || isQueued) ? (
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {content}
                      </div>
                    ) : (
                      <MarkdownContent text={content} />
                    )
                  )}

                  {/* Tools — with contextual previews (power mode only) */}
                  {chatMode === 'power' && tools.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {tools.map((tool, toolIdx) => {
                        const toolId = `${index}-${toolIdx}`
                        const isExpanded = expandedTools.has(toolId)
                        const preview = getToolPreview(tool)

                        return (
                          <div
                            key={toolId}
                            className="bg-orange-900/30 rounded-lg border border-orange-800/50"
                          >
                            <button
                              onClick={() => toggleTool(toolId)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-900/20 transition-colors rounded-lg"
                            >
                              <Wrench className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                              <span className="text-xs text-orange-300 font-medium">
                                {tool.name || 'Tool'}
                              </span>
                              {preview && !isExpanded && (
                                <span className="text-xs text-orange-400/60 font-mono truncate flex-1 ml-1">
                                  {preview}
                                </span>
                              )}
                              {!preview && <span className="flex-1" />}
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                              )}
                            </button>

                            {isExpanded && tool.input && renderToolExpanded(tool)}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                {content && (
                  <div className={`mt-1 flex items-center gap-1 ${(isUser || isQueued) ? 'justify-end' : ''}`}>
                    <button
                      onClick={() => copyToClipboard(content, index)}
                      className={`p-1 rounded text-xs transition-colors ${
                        isUser
                          ? 'text-blue-300 hover:text-white'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                      title="Copy message"
                    >
                      {copiedIndex === index ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    {/* Memorize — only for assistant messages */}
                    {message.type === 'assistant' && (
                      <button
                        onClick={() => {
                          setMemorizeTarget({ index, content })
                          setMemorizeNote('')
                        }}
                        className="p-1 rounded text-xs transition-colors text-gray-500 hover:text-purple-400"
                        title="Save to memory"
                      >
                        <Brain className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* ============================================================
            AGENT SIGNAL — hookState is the primary source of truth.

            Signals drive the UI (and eventually an avatar):
            - permission_request → show what tool, what it wants, action buttons
            - waiting_for_input  → (no bubble, just header dot)
            - active/idle        → (no bubble, just header dot)
           ============================================================ */}

        {/* PERMISSION REQUEST — always from hookState */}
        {hookState?.status === 'permission_request' && (
          <div className="flex justify-start">
            <div className="max-w-[85%]">
              <div className="rounded-2xl px-4 py-3 bg-amber-900/40 border border-amber-600/50 text-amber-200">
                {/* Header: what tool is asking */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full animate-pulse bg-amber-400" />
                  <span className="text-xs font-medium text-amber-400">
                    {hookState.description || hookState.message || `Allow ${hookState.toolName || 'action'}?`}
                  </span>
                </div>

                {/* Command preview for Bash */}
                {hookState.toolName === 'Bash' && hookState.toolInput?.command && (
                  <div className="text-xs bg-gray-950/50 p-2 rounded font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto mb-3">
                    {hookState.toolInput.command}
                  </div>
                )}

                {/* File path for file operations */}
                {hookState.toolName !== 'Bash' && (hookState.toolInput?.file_path || hookState.toolInput?.path) && (
                  <div className="text-xs opacity-80 font-mono bg-gray-950/30 px-2 py-1 rounded mb-3">
                    {hookState.toolInput.file_path || hookState.toolInput.path}
                  </div>
                )}

                {/* Action buttons — always shown so user can respond from chat */}
                {hookState.options && hookState.options.length > 0 ? (
                  <div className="space-y-1.5">
                    {hookState.options.map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => sendQuickResponse(option.key)}
                        disabled={isSending}
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
                  /* Yes/No fallback */
                  <div className="flex gap-2">
                    <button onClick={() => sendQuickResponse('y')} disabled={isSending}
                      className="px-4 py-1.5 text-xs font-medium rounded-md bg-green-700 hover:bg-green-600 text-white transition-colors disabled:opacity-50">
                      Yes
                    </button>
                    <button onClick={() => sendQuickResponse('n')} disabled={isSending}
                      className="px-4 py-1.5 text-xs font-medium rounded-md bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50">
                      No
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Pending messages (sent via Chat but not yet in JSONL) */}
        {pendingMessages.map((pending, idx) => (
          <div key={`pending-${idx}`} className="flex justify-end">
            <div className="max-w-[85%]">
              <div className="rounded-2xl px-4 py-3 bg-blue-600/70 text-white border border-blue-500/50">
                <div className="flex items-center gap-2 mb-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-xs opacity-70">Sending...</span>
                  <span className="text-xs opacity-50 ml-auto">
                    {formatTimestamp(pending.timestamp)}
                  </span>
                </div>
                <div className="text-sm">{pending.text}</div>
              </div>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Memorize popup */}
      {memorizeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setMemorizeTarget(null)}>
          <div
            className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-full max-w-lg mx-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-gray-200">Save to Memory</h3>
              </div>
              <button
                onClick={() => setMemorizeTarget(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content preview */}
            <div className="px-4 pt-3">
              <label className="text-xs text-gray-400 mb-1 block">Agent response</label>
              <div className="text-xs text-gray-300 bg-gray-900/50 rounded-lg p-3 max-h-32 overflow-y-auto whitespace-pre-wrap border border-gray-700/50">
                {memorizeTarget.content.slice(0, 500)}{memorizeTarget.content.length > 500 ? '...' : ''}
              </div>
            </div>

            {/* Instructions textarea */}
            <div className="px-4 pt-3">
              <label className="text-xs text-gray-400 mb-1 block">Additional instructions (optional)</label>
              <textarea
                value={memorizeNote}
                onChange={e => setMemorizeNote(e.target.value)}
                placeholder="Add context, corrections, or notes for the agent to remember..."
                className="w-full bg-gray-900 text-gray-200 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 border border-gray-700 placeholder-gray-500"
                rows={3}
                autoFocus
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-4 py-3">
              <button
                onClick={() => setMemorizeTarget(null)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // TODO: save to agent memory files + database
                  console.log('[ChatView] Memorize:', { content: memorizeTarget.content, note: memorizeNote, agentId: agent.id })
                  setMemorizeTarget(null)
                }}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
              >
                Save to Memory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-gray-700 bg-gray-800 p-4 flex-shrink-0">
        {!isOnline && (
          <div className="mb-3 px-3 py-2 bg-yellow-900/20 border border-yellow-800 rounded-lg text-xs text-yellow-400">
            Agent is offline. Wake the session to send messages.
          </div>
        )}
        {isOnline && !chatWsConnected && (
          <div className="mb-3 px-3 py-2 bg-yellow-900/20 border border-yellow-800 rounded-lg text-xs text-yellow-400 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Chat disconnected — reconnecting...
          </div>
        )}

        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isOnline ? `Message ${agent.label || agent.name || agent.alias || 'agent'}... (Enter to send)` : "Agent is offline"}
            className="flex-1 bg-gray-900 text-gray-200 text-sm rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700 disabled:opacity-50"
            rows={1}
            style={{ maxHeight: '160px' }}
            disabled={!isOnline || isSending}
          />
          <button
            onClick={handleSend}
            disabled={!isOnline || isSending || !input.trim()}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          Enter = Send &bull; Shift+Enter = New Line
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState, useCallback, useMemo, type KeyboardEvent, type ChangeEvent } from 'react'
import { User, Bot, Wrench, Loader2, Send, RefreshCw, AlertCircle, ChevronDown, ChevronRight, Copy, Check, MessageSquare, Zap, Shield } from 'lucide-react'
import { MarkdownContent } from '@/components/chat/MarkdownRenderer'
import type { Agent } from '@/types/agent'

type ChatMode = 'power' | 'assisted'

interface ChatViewProps {
  agent: Agent
  isActive?: boolean  // Only connect WebSocket when active (prevents resource waste with many agents)
}

interface Message {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'thinking' | 'summary' | 'queue-operation'
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Track if we've done initial load
  const hasLoadedRef = useRef(false)
  // Track previous message count for scroll behavior
  const prevMessageCountRef = useRef(0)

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
    return `${protocol}//${host}/term?name=${encodeURIComponent(sessionName)}&chatOnly=1`
  }, [agent.name, agent.alias, agent.id])

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

      const ws = new WebSocket(getChatWsUrl())

      ws.onopen = () => {
        console.log(`[ChatView] Connected to chat WS for ${sessionName}`)
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
              setMessages(history.messages || [])
              setHookState(history.hookState || null)
              setLastModified(history.lastModified || null)
              hasLoadedRef.current = true
              setIsLoading(false)
              break
            }

            case 'chat:messages': {
              // Incremental new messages from JSONL watcher
              const newMsgs = data.data || []
              if (newMsgs.length > 0) {
                setMessages(prev => {
                  // Deduplicate by uuid/timestamp
                  const existingUuids = new Set(prev.map(m => m.uuid).filter(Boolean))
                  const uniqueNew = newMsgs.filter((m: Message) =>
                    !m.uuid || !existingUuids.has(m.uuid)
                  )
                  if (uniqueNew.length === 0) return prev
                  return [...prev, ...uniqueNew].slice(-100) // Keep last 100
                })
                // Clear pending messages when new activity arrives
                setPendingMessages([])
              }
              break
            }

            case 'chat:hookState': {
              // Real-time hook state update (permission requests, status changes)
              const newState = data.data || null
              setHookState(newState)
              // Clear pending when hookState changes (message was processed)
              setPendingMessages([])
              break
            }

            case 'chat:sent': {
              // Confirmation that message was delivered to PTY
              // Clear the pending message after a short delay
              setTimeout(() => {
                setPendingMessages(prev => prev.length > 0 ? prev.slice(1) : prev)
              }, 2000)
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
        wsRef.current = null
      }

      ws.onerror = () => {
        setError('Chat connection error')
        wsRef.current = null
      }

      wsRef.current = ws
    }

    connect()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [agent?.id, agent?.name, agent?.alias, isActive, getChatWsUrl])

  // Auto-scroll to bottom when new messages or pending messages arrive
  useEffect(() => {
    if (messages.length === 0 && pendingMessages.length === 0) return

    const hasNewMessages = messages.length > prevMessageCountRef.current
    const isInitialLoad = prevMessageCountRef.current === 0

    prevMessageCountRef.current = messages.length

    // Scroll on initial load (instant) or new messages/pending messages (smooth)
    if (isInitialLoad) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    } else if (hasNewMessages || pendingMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, pendingMessages])

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
      setError('Not connected — try refreshing')
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
                ? 'text-amber-400 hover:bg-gray-700'
                : 'text-blue-400 hover:bg-gray-700'
            }`}
            title={chatMode === 'power' ? 'Power mode — switch to Assisted' : 'Assisted mode — switch to Power'}
          >
            {chatMode === 'power' ? <Zap className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
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
          const content = getMessageContent(message)
          const tools = getToolsFromMessage(message)

          // Skip empty messages and dequeue operations
          if (!content && tools.length === 0) return null
          if (message.type === 'queue-operation' && message.operation !== 'enqueue') return null

          // Message grouping: check if previous message is same role within 60s
          const prevMsg = index > 0 ? messages[index - 1] : null
          const isSameRole = prevMsg && (
            (isUser && prevMsg.type === 'user') ||
            (isQueued && prevMsg.type === 'queue-operation' && prevMsg.operation === 'enqueue') ||
            (!isUser && !isQueued && !isThinking && prevMsg.type === 'assistant')
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
                      : isThinking
                      ? 'bg-purple-900/30 border border-purple-700/50 text-purple-200'
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
                      ) : isThinking ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Bot className="w-3.5 h-3.5" />
                      )}
                      <span className="text-xs opacity-70">
                        {isQueued ? 'Queued' : isUser ? 'You' : isThinking ? 'Thinking...' : 'Claude'}
                      </span>
                      {message.timestamp && (
                        <span className="text-xs opacity-50 ml-auto">
                          {formatTimestamp(message.timestamp)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Content — use markdown for assistant, plain for user/thinking */}
                  {content && (
                    (isUser || isQueued || isThinking) ? (
                      <div className={`text-sm whitespace-pre-wrap break-words ${isThinking ? 'italic' : ''}`}>
                        {content}
                      </div>
                    ) : (
                      <MarkdownContent text={content} />
                    )
                  )}

                  {/* Tools */}
                  {tools.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {tools.map((tool, toolIdx) => {
                        const toolId = `${index}-${toolIdx}`
                        const isExpanded = expandedTools.has(toolId)

                        return (
                          <div
                            key={toolId}
                            className="bg-orange-900/30 rounded-lg border border-orange-800/50"
                          >
                            <button
                              onClick={() => toggleTool(toolId)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-900/20 transition-colors rounded-lg"
                            >
                              <Wrench className="w-3.5 h-3.5 text-orange-400" />
                              <span className="text-xs text-orange-300 font-medium flex-1">
                                {tool.name || 'Tool'}
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-orange-400" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-orange-400" />
                              )}
                            </button>

                            {isExpanded && tool.input && (
                              <div className="px-3 pb-3">
                                <pre className="text-xs bg-gray-950/50 p-2 rounded overflow-x-auto text-gray-300">
                                  {JSON.stringify(tool.input, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Copy button */}
                {content && (
                  <button
                    onClick={() => copyToClipboard(content, index)}
                    className={`mt-1 p-1 rounded text-xs transition-colors ${
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
                  <div className="text-xs bg-gray-950/50 p-2 rounded font-mono overflow-x-auto max-h-32 overflow-y-auto mb-3">
                    {hookState.toolInput.command}
                  </div>
                )}

                {/* File path for file operations */}
                {hookState.toolName !== 'Bash' && (hookState.toolInput?.file_path || hookState.toolInput?.path) && (
                  <div className="text-xs opacity-80 font-mono bg-gray-950/30 px-2 py-1 rounded mb-3">
                    {hookState.toolInput.file_path || hookState.toolInput.path}
                  </div>
                )}

                {/* Action buttons (assisted mode) */}
                {chatMode === 'assisted' && hookState.options && hookState.options.length > 0 ? (
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
                ) : chatMode === 'assisted' ? (
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
                ) : null}
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

      {/* Input Area */}
      <div className="border-t border-gray-700 bg-gray-800 p-4 flex-shrink-0">
        {!isOnline && (
          <div className="mb-3 px-3 py-2 bg-yellow-900/20 border border-yellow-800 rounded-lg text-xs text-yellow-400">
            Agent is offline. Wake the session to send messages.
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

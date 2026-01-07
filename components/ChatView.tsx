'use client'

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react'
import { User, Bot, Wrench, Loader2, Send, RefreshCw, AlertCircle, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import type { Agent } from '@/types/agent'

interface ChatViewProps {
  agent: Agent
  isVisible?: boolean
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

export default function ChatView({ agent, isVisible = true }: ChatViewProps) {
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
  const [terminalPrompt, setTerminalPrompt] = useState<string | null>(null)
  const [promptType, setPromptType] = useState<'permission' | 'input' | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Track if we've done initial load
  const hasLoadedRef = useRef(false)
  // Track previous message count for scroll behavior
  const prevMessageCountRef = useRef(0)
  // Track previous hookState for change detection
  const prevHookStateRef = useRef<string | null>(null)

  // Fetch messages from the JSONL-based API
  const fetchMessages = useCallback(async (showLoading = false) => {
    if (!agent?.id) return

    // Only show loading on very first load, not on tab switches
    if (showLoading && !hasLoadedRef.current) setIsLoading(true)
    setError(null)

    try {
      const hostUrl = agent.hostUrl || ''
      const response = await fetch(`${hostUrl}/api/agents/${agent.id}/chat?limit=200`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch messages')
      }

      if (data.success) {
        // Only update if messages actually changed (compare length and last timestamp)
        const newMessages = data.messages || []
        const hasChanges = newMessages.length !== messages.length ||
          (newMessages.length > 0 && messages.length > 0 &&
           newMessages[newMessages.length - 1]?.timestamp !== messages[messages.length - 1]?.timestamp)

        if (hasChanges || !hasLoadedRef.current) {
          setMessages(newMessages)
          // Clear pending messages when we get new activity
          if (hasChanges && pendingMessages.length > 0) {
            setPendingMessages([])
          }
        }
        setLastModified(data.lastModified)

        // Clear pending messages if hookState changed (message was processed)
        const newHookState = data.hookState || null
        const newHookStateKey = newHookState ? `${newHookState.status}-${newHookState.updatedAt}` : null
        if (prevHookStateRef.current !== newHookStateKey) {
          prevHookStateRef.current = newHookStateKey
          setPendingMessages([])
        }
        setHookState(newHookState)

        setTerminalPrompt(data.terminalPrompt || null)
        setPromptType(data.promptType || null)
        hasLoadedRef.current = true
      }
    } catch (err) {
      console.error('[ChatView] Error fetching messages:', err)
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setIsLoading(false)
    }
  }, [agent?.id, agent?.hostUrl, messages.length, messages, pendingMessages.length])

  // Start polling when visible, but don't clear messages on tab switch
  useEffect(() => {
    if (isVisible && agent?.id) {
      // Only fetch with loading indicator if we haven't loaded yet
      if (!hasLoadedRef.current) {
        fetchMessages(true)
      }

      // Poll every 2 seconds for new messages
      pollIntervalRef.current = setInterval(() => {
        fetchMessages(false)
      }, 2000)
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [isVisible, agent?.id, fetchMessages])

  // Auto-scroll to bottom ONLY when new messages arrive (not on tab switch)
  useEffect(() => {
    // Only scroll when new messages arrive while visible
    if (!isVisible || messages.length === 0) return

    const hasNewMessages = messages.length > prevMessageCountRef.current
    const isInitialLoad = prevMessageCountRef.current === 0

    prevMessageCountRef.current = messages.length

    // Scroll on initial load (instant) or new messages (smooth)
    if (isInitialLoad) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    } else if (hasNewMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    // Tab switch: do nothing, let browser preserve scroll position
  }, [messages, isVisible])

  // Focus input when visible
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [isVisible])

  // Send message via API
  const handleSend = async () => {
    if (!input.trim() || isSending) return

    const messageToSend = input.trim()
    setInput('')
    setIsSending(true)

    // Add to pending messages immediately for instant feedback
    const pendingMsg = { text: messageToSend, timestamp: new Date().toISOString() }
    setPendingMessages(prev => [...prev, pendingMsg])

    try {
      const hostUrl = agent.hostUrl || ''
      const response = await fetch(`${hostUrl}/api/agents/${agent.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageToSend })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message')
      }

      // Clear pending message after a delay (it was sent successfully)
      // The hookState should change, indicating the message was processed
      setTimeout(() => {
        setPendingMessages(prev => prev.filter(p => p.timestamp !== pendingMsg.timestamp))
      }, 3000)

      // Fetch updated messages after a short delay
      setTimeout(() => fetchMessages(false), 500)
    } catch (err) {
      console.error('[ChatView] Error sending message:', err)
      setError(err instanceof Error ? err.message : 'Failed to send message')
      // Remove from pending and restore input on error
      setPendingMessages(prev => prev.filter(p => p.timestamp !== pendingMsg.timestamp))
      setInput(messageToSend)
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
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

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800 flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="text-sm font-medium text-gray-200">Chat</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {isOnline ? '🟢 Online' : '🔴 Offline'} •
            {messages.length} messages
            {lastModified && ` • Updated ${formatTimestamp(lastModified)}`}
          </p>
        </div>
        <button
          onClick={() => fetchMessages(true)}
          disabled={isLoading}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh messages"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
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
            <Bot className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Send a message to start the conversation</p>
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

          return (
            <div
              key={message.uuid || index}
              className={`flex ${(isUser || isQueued) ? 'justify-end' : 'justify-start'}`}
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
                  {/* Header with icon */}
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

                  {/* Content */}
                  {content && (
                    <div className={`text-sm whitespace-pre-wrap break-words ${isThinking ? 'italic' : ''}`}>
                      {content}
                    </div>
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

        {/* Hook state - permission request or waiting for input */}
        {hookState && (hookState.status === 'permission_request' || hookState.status === 'waiting_for_input') && (() => {
          // Check if this is a permission prompt (either by status or notificationType)
          const isPermission = hookState.status === 'permission_request' ||
                               hookState.notificationType === 'permission_prompt'
          return (
          <div className="flex justify-start">
            <div className="max-w-[85%]">
              <div className={`rounded-2xl px-4 py-3 ${
                isPermission
                  ? 'bg-amber-900/40 border border-amber-600/50 text-amber-200'
                  : 'bg-green-900/40 border border-green-600/50 text-green-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    isPermission ? 'bg-amber-400' : 'bg-green-400'
                  }`} />
                  <span className={`text-xs font-medium ${
                    isPermission ? 'text-amber-400' : 'text-green-400'
                  }`}>
                    {isPermission ? 'Permission Required' : 'Waiting for your input'}
                  </span>
                  {isPermission && hookState.toolName && (
                    <span className="text-xs bg-amber-700/50 px-2 py-0.5 rounded">
                      {hookState.toolName}
                    </span>
                  )}
                </div>

                {/* Show "Do you want to proceed?" like terminal */}
                {isPermission && (
                  <div className="text-sm font-medium mb-2">Do you want to proceed?</div>
                )}

                {/* Show command preview for Bash permissions */}
                {isPermission && hookState.toolName === 'Bash' && hookState.toolInput?.command && (
                  <div className="mb-3 text-xs bg-gray-950/50 p-2 rounded font-mono overflow-x-auto max-h-24 overflow-y-auto">
                    {hookState.toolInput.command}
                  </div>
                )}

                {/* Show file path for Read/Edit/Write/Grep permissions */}
                {isPermission && (hookState.toolName === 'Read' || hookState.toolName === 'Edit' || hookState.toolName === 'Write' || hookState.toolName === 'Grep') && (hookState.toolInput?.file_path || hookState.toolInput?.path) && (
                  <div className="mb-3 text-xs opacity-80 font-mono bg-gray-950/30 px-2 py-1 rounded">
                    {hookState.toolInput.file_path || hookState.toolInput.path}
                  </div>
                )}

                {/* Show options like terminal */}
                {isPermission && hookState.options && hookState.options.length > 0 && (
                  <div className="space-y-1.5 text-sm">
                    {hookState.options.map((option, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-amber-400 font-medium w-4">{option.key}.</span>
                        <span className="opacity-90">{option.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Fallback if no options */}
                {isPermission && (!hookState.options || hookState.options.length === 0) && (
                  <div className="mt-2 text-xs opacity-60">
                    Reply with &quot;y&quot; to approve or &quot;n&quot; to deny
                  </div>
                )}

                {/* Non-permission waiting state */}
                {!isPermission && (
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {hookState.message || 'Waiting for your response...'}
                  </div>
                )}
              </div>
            </div>
          </div>
          )
        })()}

        {/* Pending messages (sent via Chat but not yet in JSONL) - shown after the prompt */}
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

        {/* Terminal prompt fallback - only show if no hook state */}
        {!hookState && terminalPrompt && (
          <div className="flex justify-start">
            <div className="max-w-[85%]">
              <div className={`rounded-2xl px-4 py-3 ${
                promptType === 'permission'
                  ? 'bg-amber-900/40 border border-amber-600/50 text-amber-200'
                  : 'bg-green-900/40 border border-green-600/50 text-green-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    promptType === 'permission' ? 'bg-amber-400' : 'bg-green-400'
                  }`} />
                  <span className={`text-xs font-medium ${
                    promptType === 'permission' ? 'text-amber-400' : 'text-green-400'
                  }`}>
                    {promptType === 'permission' ? 'Permission Required' : 'Ready for input'}
                  </span>
                </div>
                <div className="text-sm whitespace-pre-wrap break-words font-mono">
                  {terminalPrompt}
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-700 bg-gray-800 p-4 flex-shrink-0">
        {!isOnline && (
          <div className="mb-3 px-3 py-2 bg-yellow-900/20 border border-yellow-800 rounded-lg text-xs text-yellow-400">
            ⚠️ Agent is offline. Wake the session to send messages.
          </div>
        )}

        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isOnline ? "Type your message... (Enter to send)" : "Agent is offline"}
            className="flex-1 bg-gray-900 text-gray-200 text-sm rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700 disabled:opacity-50"
            rows={2}
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
          Enter = Send • Shift+Enter = New Line
        </div>
      </div>
    </div>
  )
}

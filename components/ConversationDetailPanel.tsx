'use client'

import { useState, useEffect } from 'react'
import { X, Clock, FileCode, GitBranch, MessageSquare, Wrench, ChevronRight, User, Bot, Terminal } from 'lucide-react'

interface ConversationDetailPanelProps {
  conversationFile: string
  projectPath: string
  onClose: () => void
}

interface ContentBlock {
  type: string
  text?: string
  [key: string]: any
}

interface Message {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'summary'
  timestamp?: string
  message?: {
    content?: string | ContentBlock[]
    model?: string
    tool_uses?: Array<{
      type: string
      function?: string
      name?: string
    }>
  }
  toolName?: string
  toolInput?: any
  toolResult?: any
  sessionId?: string
  cwd?: string
  gitBranch?: string
  version?: string
  summary?: string
}

interface ConversationMetadata {
  sessionId?: string
  cwd?: string
  gitBranch?: string
  claudeVersion?: string
  model?: string
  firstMessageAt?: Date
  lastMessageAt?: Date
  totalMessages: number
  toolsUsed: string[]
}

export default function ConversationDetailPanel({ conversationFile, projectPath, onClose }: ConversationDetailPanelProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [metadata, setMetadata] = useState<ConversationMetadata | null>(null)
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set())

  useEffect(() => {
    loadConversation()
  }, [conversationFile])

  const loadConversation = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/conversations/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationFile })
      })

      if (!response.ok) {
        throw new Error('Failed to load conversation')
      }

      const data = await response.json()
      setMessages(data.messages || [])
      setMetadata(data.metadata || null)
    } catch (err) {
      console.error('[ConversationDetail] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const toggleMessage = (index: number) => {
    const newExpanded = new Set(expandedMessages)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedMessages(newExpanded)
  }

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getFileName = () => {
    return conversationFile.split('/').pop() || conversationFile
  }

  const getToolsFromMessage = (message: Message): string[] => {
    const tools: string[] = []

    // Check content array for tool_use blocks
    if (message.message?.content && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type === 'tool_use' && block.name) {
          tools.push(block.name)
        }
      }
    }

    return tools
  }

  const hasTools = (message: Message): boolean => {
    return getToolsFromMessage(message).length > 0
  }

  const getToolResultsFromMessage = (message: Message): any[] => {
    const toolResults: any[] = []

    // Check content array for tool_result blocks
    if (message.message?.content && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type === 'tool_result') {
          toolResults.push(block)
        }
      }
    }

    return toolResults
  }

  const hasToolResults = (message: Message): boolean => {
    return getToolResultsFromMessage(message).length > 0
  }

  const isSystemMessage = (message: Message): boolean => {
    // Check if message contains system tags like <command-message>, <system-reminder>, etc.
    if (message.message?.content) {
      const content = message.message.content
      if (typeof content === 'string') {
        return content.includes('<command-message>') ||
               content.includes('<system-reminder>') ||
               content.includes('<command-name>')
      }
      if (Array.isArray(content)) {
        return content.some(block =>
          block.type === 'text' &&
          block.text &&
          (block.text.includes('<command-message>') ||
           block.text.includes('<system-reminder>') ||
           block.text.includes('<command-name>'))
        )
      }
    }
    return false
  }

  const getMessagePreview = (message: Message): string => {
    // Handle summary type
    if (message.type === 'summary' && message.summary) {
      return message.summary
    }

    // Handle tool results (nested in user messages)
    if (hasToolResults(message)) {
      const results = getToolResultsFromMessage(message)
      return `Tool result${results.length > 1 ? 's' : ''} returned`
    }

    // Handle system messages
    if (isSystemMessage(message)) {
      const content = message.message?.content
      if (typeof content === 'string') {
        // Extract command-message or system-reminder content
        const commandMatch = content.match(/<command-message>(.*?)<\/command-message>/)
        if (commandMatch) return commandMatch[1]
        const reminderMatch = content.match(/<system-reminder>(.*?)<\/system-reminder>/)
        if (reminderMatch) return reminderMatch[1].substring(0, 150)
      }
      return 'System notification'
    }

    // Handle tool use
    if (message.type === 'tool_use' && message.toolName) {
      return `Tool: ${message.toolName}`
    }

    // Handle message content
    if (message.message?.content) {
      const content = message.message.content

      // String content (simple case)
      if (typeof content === 'string') {
        return content.substring(0, 150)
      }

      // Array content (Claude API format)
      if (Array.isArray(content)) {
        const textBlock = content.find(block => block.type === 'text' && block.text)
        if (textBlock?.text) {
          return textBlock.text.substring(0, 150)
        }
      }
    }

    return 'Click to expand'
  }

  const renderMessageContent = (message: Message) => {
    // Handle summary
    if (message.type === 'summary' && message.summary) {
      return <div className="text-sm text-gray-200">{message.summary}</div>
    }

    // Handle system messages
    if (isSystemMessage(message)) {
      const content = message.message?.content
      if (typeof content === 'string') {
        return (
          <div className="text-sm text-gray-300 space-y-2">
            {content.split('\n').map((line, idx) => {
              // Extract and format command-message
              const commandMatch = line.match(/<command-message>(.*?)<\/command-message>/)
              if (commandMatch) {
                return (
                  <div key={idx} className="bg-gray-900/50 p-2 rounded border-l-2 border-gray-600">
                    {commandMatch[1]}
                  </div>
                )
              }
              // Extract and format command-name
              const nameMatch = line.match(/<command-name>(.*?)<\/command-name>/)
              if (nameMatch) {
                return (
                  <div key={idx} className="text-xs text-gray-500">
                    Command: {nameMatch[1]}
                  </div>
                )
              }
              // Extract and format system-reminder (show first 200 chars)
              const reminderMatch = line.match(/<system-reminder>(.*?)<\/system-reminder>/)
              if (reminderMatch) {
                const text = reminderMatch[1].substring(0, 200)
                return (
                  <div key={idx} className="bg-gray-900/30 p-2 rounded text-xs text-gray-400 italic">
                    {text}{reminderMatch[1].length > 200 ? '...' : ''}
                  </div>
                )
              }
              // Regular line
              return line.trim() ? (
                <div key={idx} className="text-gray-300">{line}</div>
              ) : null
            })}
          </div>
        )
      }
    }

    // Handle message content
    if (message.message?.content) {
      const content = message.message.content

      // String content
      if (typeof content === 'string') {
        return (
          <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
            {content}
          </div>
        )
      }

      // Array content (Claude API format)
      if (Array.isArray(content)) {
        return (
          <div className="space-y-2">
            {content.map((block, idx) => {
              if (block.type === 'text' && block.text) {
                return (
                  <div key={idx} className="text-sm text-gray-200 whitespace-pre-wrap break-words">
                    {block.text}
                  </div>
                )
              }
              if (block.type === 'tool_use') {
                return (
                  <div key={idx} className="text-xs bg-gray-900/50 p-3 rounded">
                    <div className="text-gray-400 mb-1">Tool: {block.name || 'unknown'}</div>
                    <pre className="text-gray-300 overflow-x-auto">
                      {JSON.stringify(block.input || block, null, 2)}
                    </pre>
                  </div>
                )
              }
              if (block.type === 'tool_result') {
                return (
                  <div key={idx} className="text-xs bg-yellow-900/30 p-3 rounded border border-yellow-800/50">
                    <div className="text-yellow-400 mb-1 flex items-center gap-1">
                      <FileCode className="w-3 h-3" />
                      Tool Result {block.tool_use_id ? `(${block.tool_use_id.slice(0, 20)}...)` : ''}
                    </div>
                    <pre className="text-gray-200 overflow-x-auto whitespace-pre-wrap max-h-64">
                      {typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2)}
                    </pre>
                  </div>
                )
              }
              // Other block types
              return (
                <div key={idx} className="text-xs bg-gray-900/50 p-3 rounded overflow-x-auto">
                  <pre className="text-gray-300">
                    {JSON.stringify(block, null, 2)}
                  </pre>
                </div>
              )
            })}
          </div>
        )
      }
    }

    return null
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[800px] bg-gray-900 border-l border-gray-700 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-white truncate">Conversation Details</h2>
          <p className="text-sm text-gray-400 truncate font-mono">{getFileName()}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-4 p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Metadata */}
      {metadata && !loading && (
        <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50 flex-shrink-0">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <span className="text-gray-400">Messages:</span>
              <span className="text-white font-medium">{metadata.totalMessages}</span>
            </div>
            {metadata.model && (
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-400" />
                <span className="text-gray-400">Model:</span>
                <span className="text-white font-medium">{metadata.model}</span>
              </div>
            )}
            {metadata.gitBranch && (
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-green-400" />
                <span className="text-gray-400">Branch:</span>
                <span className="text-white font-medium">{metadata.gitBranch}</span>
              </div>
            )}
            {metadata.toolsUsed.length > 0 && (
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-orange-400" />
                <span className="text-gray-400">Tools:</span>
                <span className="text-white font-medium">{metadata.toolsUsed.length}</span>
              </div>
            )}
          </div>
          {metadata.cwd && (
            <div className="mt-3 text-xs text-gray-500 font-mono truncate">
              {metadata.cwd}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-400">Loading conversation...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md px-6">
              <p className="text-red-400 mb-2">Failed to load conversation</p>
              <p className="text-sm text-gray-500">{error}</p>
              <button
                onClick={loadConversation}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No messages found in this conversation</p>
          </div>
        )}

        {!loading && !error && messages.length > 0 && (
          <div className="p-6 space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`rounded-lg border ${
                  hasToolResults(message)
                    ? 'bg-yellow-900/20 border-yellow-800/50'
                    : isSystemMessage(message)
                    ? 'bg-gray-800/50 border-gray-700/50'
                    : message.type === 'user'
                    ? 'bg-blue-900/20 border-blue-800/50'
                    : message.type === 'assistant' && hasTools(message)
                    ? 'bg-orange-900/20 border-orange-800/50'
                    : message.type === 'assistant'
                    ? 'bg-purple-900/20 border-purple-800/50'
                    : message.type === 'tool_result'
                    ? 'bg-yellow-900/20 border-yellow-800/50'
                    : 'bg-gray-800/50 border-gray-700/50'
                }`}
              >
                <div
                  className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => toggleMessage(index)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {hasToolResults(message) ? (
                        <>
                          <FileCode className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-white">
                            Tool Result{getToolResultsFromMessage(message).length > 1 ? 's' : ''}
                          </span>
                        </>
                      ) : isSystemMessage(message) ? (
                        <>
                          <Terminal className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-300">System</span>
                        </>
                      ) : message.type === 'user' ? (
                        <>
                          <User className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-white">User</span>
                        </>
                      ) : message.type === 'assistant' && hasTools(message) ? (
                        <>
                          <Wrench className="w-4 h-4 text-orange-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-white truncate">
                            Tools: {getToolsFromMessage(message).join(', ')}
                          </span>
                        </>
                      ) : message.type === 'assistant' ? (
                        <>
                          <Bot className="w-4 h-4 text-purple-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-white">Assistant</span>
                        </>
                      ) : message.type === 'tool_result' ? (
                        <>
                          <FileCode className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-white">
                            Tool Result: {message.toolName || 'Unknown'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-white capitalize">{message.type}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {message.timestamp && (
                        <span className="text-xs text-gray-500">
                          {formatTimestamp(message.timestamp)}
                        </span>
                      )}
                      <ChevronRight
                        className={`w-4 h-4 text-gray-500 transition-transform ${
                          expandedMessages.has(index) ? 'rotate-90' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Preview */}
                  {!expandedMessages.has(index) && (
                    <div className="text-sm text-gray-300 line-clamp-2">
                      {getMessagePreview(message)}
                    </div>
                  )}
                </div>

                {/* Expanded Content */}
                {expandedMessages.has(index) && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Message Content */}
                    {renderMessageContent(message)}

                    {/* Tool Use Details */}
                    {message.type === 'tool_use' && message.toolName && (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-400 font-semibold">Tool: {message.toolName}</div>
                        {message.toolInput && (
                          <pre className="text-xs bg-gray-900/50 p-3 rounded overflow-x-auto text-gray-300">
                            {JSON.stringify(message.toolInput, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Tool Result */}
                    {message.type === 'tool_result' && message.toolResult && (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-400 font-semibold">Result:</div>
                        <pre className="text-xs bg-gray-900/50 p-3 rounded overflow-x-auto text-gray-300 max-h-64">
                          {typeof message.toolResult === 'string'
                            ? message.toolResult
                            : JSON.stringify(message.toolResult, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Model Info */}
                    {message.message?.model && (
                      <div className="text-xs text-gray-500">
                        Model: {message.message.model}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

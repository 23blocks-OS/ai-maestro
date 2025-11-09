'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X,
  Clock,
  GitBranch,
  MessageSquare,
  User,
  Bot,
  Wrench,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

interface MobileConversationDetailProps {
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
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'summary' | 'skill' | 'thinking'
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
  isSkill?: boolean
  originalType?: string
  thinking?: string
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

export default function MobileConversationDetail({
  conversationFile,
  projectPath,
  onClose
}: MobileConversationDetailProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [metadata, setMetadata] = useState<ConversationMetadata | null>(null)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [matchedIndices, setMatchedIndices] = useState<number[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConversation()
  }, [conversationFile])

  useEffect(() => {
    if (searchQuery) {
      const matches = messages
        .map((msg, idx) => ({ msg, idx }))
        .filter(({ msg }) => {
          const content = getFullMessageContent(msg)
          return content.toLowerCase().includes(searchQuery.toLowerCase())
        })
        .map(({ idx }) => idx)
      setMatchedIndices(matches)
      setCurrentMatchIndex(0)
    } else {
      setMatchedIndices([])
      setCurrentMatchIndex(0)
    }
  }, [searchQuery, messages])

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
      console.error('[MobileConversationDetail] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const toggleTool = (toolId: string) => {
    const newExpanded = new Set(expandedTools)
    if (newExpanded.has(toolId)) {
      newExpanded.delete(toolId)
    } else {
      newExpanded.add(toolId)
    }
    setExpandedTools(newExpanded)
  }

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getFullMessageContent = (message: Message): string => {
    if (message.type === 'thinking' && message.thinking) {
      return message.thinking
    }

    if (message.message?.content) {
      const content = message.message.content
      if (typeof content === 'string') {
        return content
      }
      if (Array.isArray(content)) {
        return content
          .filter(block => block.type === 'text' && block.text)
          .map(block => block.text)
          .join('\n\n')
      }
    }

    return ''
  }

  const getToolsFromMessage = (message: Message): ContentBlock[] => {
    if (message.message?.content && Array.isArray(message.message.content)) {
      return message.message.content.filter(block => block.type === 'tool_use')
    }
    return []
  }

  const navigateSearch = (direction: 'prev' | 'next') => {
    if (matchedIndices.length === 0) return

    let newIndex = currentMatchIndex
    if (direction === 'next') {
      newIndex = (currentMatchIndex + 1) % matchedIndices.length
    } else {
      newIndex = currentMatchIndex === 0 ? matchedIndices.length - 1 : currentMatchIndex - 1
    }
    setCurrentMatchIndex(newIndex)

    // Scroll to matched message
    const messageIndex = matchedIndices[newIndex]
    const element = document.getElementById(`message-${messageIndex}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const getFileName = () => {
    return conversationFile.split('/').pop() || conversationFile
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 text-blue-400 animate-pulse mb-3 mx-auto" />
          <p className="text-sm text-gray-400">Loading conversation...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
        <header className="flex-shrink-0 border-b border-gray-800 bg-gray-950 px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <h1 className="text-sm font-semibold text-white">Error</h1>
            <div className="w-9" />
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <div>
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <button
              onClick={loadConversation}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-800 bg-gray-950">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <h1 className="text-sm font-semibold text-white truncate flex-1 mx-3">
              Conversation
            </h1>
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`p-2 rounded-lg transition-colors ${
                showSearch ? 'bg-blue-900/30 text-blue-400' : 'hover:bg-gray-800 text-gray-400'
              }`}
            >
              <Search className="w-5 h-5" />
            </button>
          </div>

          {/* Metadata */}
          {metadata && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {metadata.gitBranch && (
                <div className="flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  <span className="truncate max-w-[120px]">{metadata.gitBranch}</span>
                </div>
              )}
              <span>•</span>
              <span>{metadata.totalMessages} messages</span>
            </div>
          )}
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="px-4 pb-3 border-t border-gray-800">
            <div className="flex items-center gap-2 mt-3">
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-800 text-white rounded-lg text-sm border border-gray-700 focus:outline-none focus:border-blue-500"
                autoFocus
              />
              {matchedIndices.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>{currentMatchIndex + 1}/{matchedIndices.length}</span>
                  <button
                    onClick={() => navigateSearch('prev')}
                    className="p-1 hover:bg-gray-800 rounded"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigateSearch('next')}
                    className="p-1 hover:bg-gray-800 rounded"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.map((message, index) => {
          const content = getFullMessageContent(message)
          const tools = getToolsFromMessage(message)
          const isHighlighted = matchedIndices.includes(index) && matchedIndices[currentMatchIndex] === index

          // Skip empty messages
          if (!content && tools.length === 0 && message.type !== 'thinking') {
            return null
          }

          return (
            <div
              key={index}
              id={`message-${index}`}
              className={`${isHighlighted ? 'ring-2 ring-blue-500 rounded-lg' : ''}`}
            >
              {/* User Message */}
              {message.type === 'user' && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-blue-400">User</span>
                      {message.timestamp && (
                        <span className="text-xs text-gray-500">{formatTimestamp(message.timestamp)}</span>
                      )}
                    </div>
                    <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                      <p className="text-sm text-white whitespace-pre-wrap break-words">{content}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Assistant Message */}
              {message.type === 'assistant' && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-purple-400">Claude</span>
                      {message.timestamp && (
                        <span className="text-xs text-gray-500">{formatTimestamp(message.timestamp)}</span>
                      )}
                    </div>
                    <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                      <p className="text-sm text-white whitespace-pre-wrap break-words">{content}</p>
                    </div>

                    {/* Tools Used */}
                    {tools.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {tools.map((tool, toolIdx) => {
                          const toolId = `${index}-${toolIdx}`
                          const isExpanded = expandedTools.has(toolId)
                          return (
                            <div key={toolIdx} className="bg-gray-800/30 rounded-lg overflow-hidden">
                              <button
                                onClick={() => toggleTool(toolId)}
                                className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-gray-800/50 transition-colors"
                              >
                                <Wrench className="w-3 h-3 text-orange-400 flex-shrink-0" />
                                <span className="text-xs text-orange-400 font-medium flex-1">{tool.name}</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3 text-gray-500" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-gray-500" />
                                )}
                              </button>
                              {isExpanded && (
                                <div className="px-3 py-2 border-t border-gray-700">
                                  <pre className="text-xs text-gray-400 overflow-x-auto">
                                    {JSON.stringify(tool.input || tool, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Thinking Message */}
              {message.type === 'thinking' && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-yellow-600/20 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-yellow-400">Thinking</span>
                    </div>
                    <div className="bg-yellow-900/10 border border-yellow-900/30 rounded-lg px-3 py-2">
                      <p className="text-xs text-yellow-400/80 whitespace-pre-wrap break-words">{content}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

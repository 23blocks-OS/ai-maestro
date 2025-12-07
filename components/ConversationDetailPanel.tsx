'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Clock, FileCode, GitBranch, MessageSquare, Wrench, ChevronRight, User, Bot, Terminal, Sparkles, List, MessageCircle, Search, ChevronUp, ChevronDown, Copy, Check } from 'lucide-react'

interface ConversationDetailPanelProps {
  conversationFile: string
  projectPath: string
  agentId?: string
  hostUrl?: string
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

export default function ConversationDetailPanel({ conversationFile, projectPath, agentId, hostUrl = '', onClose }: ConversationDetailPanelProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [metadata, setMetadata] = useState<ConversationMetadata | null>(null)
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set())
  const [viewMode, setViewMode] = useState<'list' | 'chat'>('list')
  const [expandedToolInChat, setExpandedToolInChat] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null)
  const [useSemanticSearch, setUseSemanticSearch] = useState(false)
  const [semanticResults, setSemanticResults] = useState<Array<{msg_id: string, score: number, index: number}>>([])
  const [isSearching, setIsSearching] = useState(false)
  const messageRefs = useRef<{ [key: number]: HTMLDivElement | null }>({})
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConversation()
  }, [conversationFile, hostUrl])

  const loadConversation = async () => {
    setLoading(true)
    setError(null)

    try {
      // Use hostUrl for remote agents, empty for local
      const apiUrl = `${hostUrl}/api/conversations/parse`
      console.log('[ConversationDetail] Fetching from:', apiUrl, 'for file:', conversationFile)

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationFile })
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('[ConversationDetail] API error:', response.status, data)
        throw new Error(data.error || `Failed to load conversation (${response.status})`)
      }

      if (!data.success) {
        console.error('[ConversationDetail] API returned success=false:', data)
        throw new Error(data.error || 'Failed to parse conversation')
      }

      console.log('[ConversationDetail] API returned', data.messages?.length, 'messages')
      const thinkingInResponse = data.messages?.filter((m: Message) => m.type === 'thinking') || []
      console.log('[ConversationDetail] Thinking messages in API response:', thinkingInResponse.length, thinkingInResponse)
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

    // Handle thinking messages
    if (message.type === 'thinking' && message.thinking) {
      return message.thinking.substring(0, 150)
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

  const getFullMessageContent = (message: Message): string => {
    // Handle message content - return FULL content for chat view
    if (message.message?.content) {
      const content = message.message.content

      // String content (simple case)
      if (typeof content === 'string') {
        return content
      }

      // Array content (Claude API format) - extract all text blocks
      if (Array.isArray(content)) {
        const textBlocks = content
          .filter(block => block.type === 'text' && block.text)
          .map(block => block.text)
        return textBlocks.join('\n\n')
      }
    }

    return ''
  }

  const renderMessageContent = (message: Message) => {
    // Handle summary
    if (message.type === 'summary' && message.summary) {
      return (
        <div className="text-sm text-gray-200">
          {highlightText(message.summary, searchQuery)}
        </div>
      )
    }

    // Handle thinking messages
    if (message.type === 'thinking' && message.thinking) {
      return (
        <div className="text-sm text-gray-200 italic whitespace-pre-wrap break-words">
          {highlightText(message.thinking, searchQuery)}
        </div>
      )
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
            {highlightText(content, searchQuery)}
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
                    {highlightText(block.text, searchQuery)}
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

  // Search helper: extract searchable text from a message
  const getSearchableText = (message: Message): string => {
    const parts: string[] = []

    // Add thinking content
    if (message.thinking) {
      parts.push(message.thinking)
    }

    // Add summary
    if (message.summary) {
      parts.push(message.summary)
    }

    // Add message content
    if (message.message?.content) {
      const content = message.message.content
      if (typeof content === 'string') {
        parts.push(content)
      } else if (Array.isArray(content)) {
        content.forEach(block => {
          if (block.type === 'text' && block.text) {
            parts.push(block.text)
          }
        })
      }
    }

    // Add tool names
    if (message.toolName) {
      parts.push(message.toolName)
    }

    return parts.join(' ').toLowerCase()
  }

  // Perform semantic search via RAG API
  const performSemanticSearch = async (query: string) => {
    if (!agentId || !query.trim()) {
      setSemanticResults([])
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`${hostUrl}/api/agents/${agentId}/search?q=${encodeURIComponent(query)}&conversation_file=${encodeURIComponent(conversationFile)}&limit=50`)
      if (response.ok) {
        const data = await response.json()
        // Map results to message indices
        const results = data.results.map((result: any) => {
          // Find the message index that matches this result's text
          const index = messages.findIndex(msg => {
            const msgText = getSearchableText(msg)
            return msgText === result.text.toLowerCase()
          })
          return { msg_id: result.msg_id, score: result.score, index }
        }).filter((r: any) => r.index !== -1)

        setSemanticResults(results)
      }
    } catch (error) {
      console.error('Semantic search error:', error)
      setSemanticResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // Trigger semantic search when query changes and semantic search is enabled
  useEffect(() => {
    if (useSemanticSearch && searchQuery.trim()) {
      performSemanticSearch(searchQuery)
    } else {
      setSemanticResults([])
    }
  }, [searchQuery, useSemanticSearch, agentId, conversationFile, messages])

  // Check if a message matches the search query
  const messageMatchesSearch = (message: Message): boolean => {
    if (!searchQuery.trim()) return false
    const searchText = getSearchableText(message)
    return searchText.includes(searchQuery.toLowerCase())
  }

  // Get match indices for navigation (indices in the full messages array)
  const matchIndices = searchQuery.trim()
    ? useSemanticSearch
      ? semanticResults.map(r => r.index) // Use semantic search results
      : messages.map((message, index) => {  // Use local text search
          return messageMatchesSearch(message) ? index : -1
        }).filter(index => index !== -1)
    : []

  const totalMatches = matchIndices.length

  const goToNextMatch = () => {
    if (totalMatches > 0) {
      setCurrentMatchIndex((prev) => (prev + 1) % totalMatches)
    }
  }

  const goToPrevMatch = () => {
    if (totalMatches > 0) {
      setCurrentMatchIndex((prev) => (prev - 1 + totalMatches) % totalMatches)
    }
  }

  // Reset match index when search changes
  useEffect(() => {
    setCurrentMatchIndex(0)
  }, [searchQuery])

  // Scroll to current match when it changes and expand it in list view
  useEffect(() => {
    if (matchIndices.length > 0 && currentMatchIndex >= 0 && currentMatchIndex < matchIndices.length) {
      const messageIndex = matchIndices[currentMatchIndex]

      // Expand the message in list view
      if (viewMode === 'list') {
        setExpandedMessages((prev) => {
          const newExpanded = new Set(prev)
          newExpanded.add(messageIndex)
          return newExpanded
        })
      }

      // Scroll to the message within the scroll container
      const element = messageRefs.current[messageIndex]
      const container = scrollContainerRef.current

      if (element && container) {
        // Add a small delay to ensure expansion happens before scrolling
        setTimeout(() => {
          const elementRect = element.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()

          // Calculate the position to scroll to (center the element in the container)
          const scrollTop = element.offsetTop - container.offsetTop - (containerRect.height / 2) + (elementRect.height / 2)

          container.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
          })
        }, 150)
      }
    }
  }, [currentMatchIndex, matchIndices, viewMode])

  // Copy message content to clipboard
  const copyMessageToClipboard = async (message: Message, index: number) => {
    let textToCopy = ''

    // Extract text based on message type
    if (message.type === 'summary' && message.summary) {
      textToCopy = message.summary
    } else if (message.type === 'thinking' && message.thinking) {
      textToCopy = message.thinking
    } else if (message.message?.content) {
      const content = message.message.content
      if (typeof content === 'string') {
        textToCopy = content
      } else if (Array.isArray(content)) {
        // Extract all text blocks
        const textBlocks = content
          .filter(block => block.type === 'text' && block.text)
          .map(block => block.text)
        textToCopy = textBlocks.join('\n\n')
      }
    }

    if (!textToCopy.trim()) {
      textToCopy = getMessagePreview(message)
    }

    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopiedMessageIndex(index)
      // Clear the copied state after 2 seconds
      setTimeout(() => setCopiedMessageIndex(null), 2000)
    } catch (err) {
      console.error('Failed to copy message:', err)
    }
  }

  // Highlight search term in text
  const highlightText = (text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text

    const parts = text.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))

    return (
      <>
        {parts.map((part, index) =>
          part.toLowerCase() === searchTerm.toLowerCase() ? (
            <mark key={index} className="bg-yellow-400/30 text-yellow-200 rounded px-0.5">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    )
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[800px] bg-gray-900 border-l border-gray-700 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
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

        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={useSemanticSearch ? "AI semantic search..." : "Search in conversation..."}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          {agentId && (
            <button
              onClick={() => setUseSemanticSearch(!useSemanticSearch)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                useSemanticSearch
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
              title={useSemanticSearch ? "Using AI semantic search" : "Using text search"}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{useSemanticSearch ? 'AI Search' : 'Text Search'}</span>
            </button>
          )}
          {searchQuery && (
            <>
              <div className="flex items-center gap-1 text-xs text-gray-400 min-w-[80px] justify-end">
                {totalMatches > 0 ? (
                  <span>{currentMatchIndex + 1} of {totalMatches}</span>
                ) : (
                  <span>No matches</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={goToPrevMatch}
                  disabled={totalMatches === 0}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Previous match"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={goToNextMatch}
                  disabled={totalMatches === 0}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Next match"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Metadata */}
      {metadata && !loading && (
        <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="grid grid-cols-2 gap-4 text-sm flex-1">
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

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <List className="w-4 h-4" />
                <span className="text-sm font-medium">List</span>
              </button>
              <button
                onClick={() => setViewMode('chat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
                  viewMode === 'chat'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Chat</span>
              </button>
            </div>
          </div>

          {metadata.cwd && (
            <div className="text-xs text-gray-500 font-mono truncate">
              {metadata.cwd}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
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

        {!loading && !error && messages.length > 0 && viewMode === 'chat' && (
          <div className="p-6 space-y-4 max-w-4xl mx-auto">
            {(() => {
              console.log('[Chat View] Rendering chat view with', messages.length, 'messages')
              console.log('[Chat View] Messages array:', messages.map(m => ({ type: m.type, hasThinking: !!m.thinking })))
              const thinkingMessages = messages.filter(m => m.type === 'thinking')
              console.log('[Chat View] Found', thinkingMessages.length, 'thinking messages:', thinkingMessages)
              const chatBubbles: JSX.Element[] = []
              let skipUntilIndex = -1

              messages.forEach((message, index) => {
                if (message.type === 'thinking') {
                  console.log('[Chat View] THINKING MESSAGE FOUND at index', index, message)
                }

                // Skip if we've already processed this message as part of a group
                // BUT don't skip tool_result, system, or thinking messages - they render separately
                if (index <= skipUntilIndex && !hasToolResults(message) && !isSystemMessage(message) && message.type !== 'thinking') {
                  return
                }

                // Handle system messages separately
                if (isSystemMessage(message)) {
                  const isMatch = messageMatchesSearch(message)
                  const isCurrentMatch = searchQuery.trim() && matchIndices[currentMatchIndex] === index

                  chatBubbles.push(
                    <div key={index} ref={(el) => { messageRefs.current[index] = el }} className="flex justify-center my-3">
                      <div className={`max-w-[90%] bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 ${
                        isCurrentMatch
                          ? 'ring-2 ring-blue-500 shadow-lg shadow-blue-500/20'
                          : isMatch
                          ? 'ring-1 ring-yellow-500/50'
                          : ''
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Terminal className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-xs font-medium text-gray-300">System Message</span>
                          {message.timestamp && (
                            <span className="ml-auto text-xs text-gray-500">
                              {formatTimestamp(message.timestamp)}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              copyMessageToClipboard(message, index)
                            }}
                            className="p-1 rounded transition-colors hover:bg-gray-700 text-gray-400"
                            title="Copy message to clipboard"
                          >
                            {copiedMessageIndex === index ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="text-sm text-gray-300">
                          {renderMessageContent(message)}
                        </div>
                      </div>
                    </div>
                  )
                  return
                }

                // Skip tool_result messages - they'll be shown in the expanded tool panel
                if (hasToolResults(message)) {
                  return
                }

                // Handle thinking messages separately
                if (message.type === 'thinking') {
                  console.log('[Chat View] Found thinking message:', message)
                  if (!message.thinking) {
                    console.log('[Chat View] Warning: thinking message has no .thinking property')
                  }

                  const isMatch = messageMatchesSearch(message)
                  const isCurrentMatch = searchQuery.trim() && matchIndices[currentMatchIndex] === index

                  chatBubbles.push(
                    <div key={index} ref={(el) => { messageRefs.current[index] = el }} className="flex justify-start my-2">
                      <div className={`max-w-[85%] bg-purple-900/20 border border-purple-700/40 rounded-lg px-4 py-3 ${
                        isCurrentMatch
                          ? 'ring-2 ring-blue-500 shadow-lg shadow-blue-500/20'
                          : isMatch
                          ? 'ring-1 ring-yellow-500/50'
                          : ''
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <MessageCircle className="w-4 h-4 text-purple-400 flex-shrink-0" />
                          <span className="text-xs font-medium text-purple-300">Thinking</span>
                          {message.timestamp && (
                            <span className="ml-auto text-xs text-gray-500">
                              {formatTimestamp(message.timestamp)}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              copyMessageToClipboard(message, index)
                            }}
                            className="p-1 rounded transition-colors hover:bg-purple-800/50 text-purple-300"
                            title="Copy thinking to clipboard"
                          >
                            {copiedMessageIndex === index ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="text-sm text-gray-300 italic whitespace-pre-wrap break-words">
                          {highlightText(message.thinking || '', searchQuery)}
                        </div>
                      </div>
                    </div>
                  )
                  return
                }

                // Only process user and assistant messages as bubble starters
                if (message.type !== 'user' && message.type !== 'assistant') return

                const isUser = message.type === 'user'

                // For assistant messages, collect content and tools as structured blocks
                type ToolInfo = { name: string; timestamp?: string; messageIndex: number; message: Message }
                type ContentBlock = { type: 'text', content: string } | { type: 'tools', tools: ToolInfo[] }
                let contentBlocks: ContentBlock[] = []
                let bubbleTools: ToolInfo[] = [] // Store tools for this bubble

                if (isUser) {
                  // User messages: just get the content
                  const userContent = getFullMessageContent(message)
                  if (userContent.trim()) {
                    contentBlocks.push({ type: 'text', content: userContent })
                  }
                } else {
                  // Assistant messages: collect ALL text content first, then ALL tools
                  const firstContent = getFullMessageContent(message)
                  const firstTools = getToolsFromMessage(message)

                  // Track if we have any text content at all
                  let hasAnyText = firstContent.trim().length > 0

                  if (hasAnyText) {
                    contentBlocks.push({ type: 'text', content: firstContent })
                  }

                  // Collect tools from first message with timestamps
                  let allTools: ToolInfo[] = firstTools.map(name => ({
                    name,
                    timestamp: message.timestamp,
                    messageIndex: index,
                    message: message
                  }))
                  bubbleTools = [...allTools] // Initialize bubbleTools

                  // Look ahead and collect until next USER message OR tool_result (which indicates end of turn)
                  let hasSeenToolResult = false

                  for (let i = index + 1; i < messages.length; i++) {
                    const nextMsg = messages[i]

                    // Stop when we hit a USER message
                    if (nextMsg.type === 'user') {
                      skipUntilIndex = i - 1
                      break
                    }

                    // Stop when we hit a tool_result (end of this assistant turn)
                    if (nextMsg.type === 'tool_result') {
                      hasSeenToolResult = true
                      skipUntilIndex = i
                      continue // Skip the tool_result itself but mark it as seen
                    }

                    // If we've seen tool_result and now hit another assistant WITH TEXT, stop (new turn)
                    if (hasSeenToolResult && nextMsg.type === 'assistant') {
                      const nextContent = getFullMessageContent(nextMsg)
                      if (nextContent.trim()) {
                        // This is a new turn with text content, stop here
                        skipUntilIndex = i - 1
                        break
                      }
                    }

                    // Collect content from additional assistant messages
                    if (nextMsg.type === 'assistant') {
                      const moreContent = getFullMessageContent(nextMsg)
                      if (moreContent.trim()) {
                        hasAnyText = true
                        contentBlocks.push({ type: 'text', content: moreContent })
                      }
                      // Collect tools from this assistant message with timestamp
                      const moreTools = getToolsFromMessage(nextMsg)
                      allTools.push(...moreTools.map(name => ({
                        name,
                        timestamp: nextMsg.timestamp,
                        messageIndex: i,
                        message: nextMsg
                      })))
                    }

                    // Collect tool names from tool_use messages with timestamp
                    if (nextMsg.type === 'tool_use' && nextMsg.toolName) {
                      allTools.push({
                        name: nextMsg.toolName,
                        timestamp: nextMsg.timestamp,
                        messageIndex: i,
                        message: nextMsg
                      })
                    }

                    // Mark this as the last message to skip
                    skipUntilIndex = i
                  }

                  // Only create a bubble if we have text content (skip tool-only assistant messages)
                  if (!hasAnyText && allTools.length > 0) {
                    // Skip this bubble - it's just tools with no text, will be picked up by previous bubble
                    return
                  }

                  // Add all tools at the end, after all text content
                  if (allTools.length > 0) {
                    contentBlocks.push({ type: 'tools', tools: allTools })
                    bubbleTools = [...allTools] // Update bubbleTools with final collected tools
                  }
                }

                // Skip only if there's no content blocks
                if (contentBlocks.length === 0) return

                const isMatch = messageMatchesSearch(message)
                const isCurrentMatch = searchQuery.trim() && matchIndices[currentMatchIndex] === index

                chatBubbles.push(
                  <div key={index} ref={(el) => { messageRefs.current[index] = el }} className="flex flex-col">
                    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[80%]">
                      {/* Message bubble */}
                      <div
                        className={`rounded-2xl px-4 py-3 ${
                          isUser ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200'
                        } ${
                          isCurrentMatch
                            ? 'ring-2 ring-blue-500 shadow-lg shadow-blue-500/20'
                            : isMatch
                            ? 'ring-1 ring-yellow-500/50'
                            : ''
                        }`}
                      >
                        {/* Render content blocks in order */}
                        {contentBlocks.map((block, blockIdx) => {
                          if (block.type === 'text') {
                            return (
                              <div key={blockIdx} className={blockIdx > 0 ? 'mt-3' : ''}>
                                <div className="text-sm whitespace-pre-wrap break-words">
                                  {highlightText(block.content, searchQuery)}
                                </div>
                              </div>
                            )
                          } else {
                            // Tools block
                            return (
                              <div key={blockIdx} className="flex flex-wrap items-start gap-2 mt-2">
                                {block.tools.map((tool, toolIdx) => {
                                  const toolKey = `${tool.messageIndex}-${tool.name}`
                                  const isExpanded = expandedToolInChat === toolKey

                                  return (
                                    <div
                                      key={toolIdx}
                                      onClick={() => setExpandedToolInChat(isExpanded ? null : toolKey)}
                                      className="flex flex-col items-center gap-0.5 bg-orange-900/30 px-2 py-1.5 rounded-lg border border-orange-800/50 cursor-pointer hover:bg-orange-900/40 transition-colors"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <Wrench className="w-3.5 h-3.5 text-orange-400" />
                                        <span className="text-xs text-orange-300 font-medium">{tool.name}</span>
                                      </div>
                                      {tool.timestamp && (
                                        <span className="text-[10px] text-orange-400/60">
                                          {formatTimestamp(tool.timestamp)}
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          }
                        })}

                        {/* Timestamp and Copy Button */}
                        <div className="flex items-center justify-between mt-2">
                          {message.timestamp && (
                            <div className={`text-xs ${isUser ? 'text-blue-200' : 'text-gray-500'}`}>
                              {formatTimestamp(message.timestamp)}
                            </div>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              copyMessageToClipboard(message, index)
                            }}
                            className={`p-1 rounded transition-colors ${
                              isUser
                                ? 'hover:bg-blue-700/50 text-blue-200'
                                : 'hover:bg-gray-700 text-gray-400'
                            }`}
                            title="Copy message to clipboard"
                          >
                            {copiedMessageIndex === index ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      </div>
                    </div>

                    {/* Expanded tool details - full width below message */}
                    {bubbleTools.some(tool => expandedToolInChat === `${tool.messageIndex}-${tool.name}`) && (
                      <div className="w-full mt-3">
                        {bubbleTools.map((tool, toolIdx) => {
                          const toolKey = `${tool.messageIndex}-${tool.name}`
                          const isExpanded = expandedToolInChat === toolKey

                          if (!isExpanded) return null

                          return (
                            <div key={toolIdx} className="bg-gray-900/95 rounded-lg p-5 border-2 border-orange-700/60 shadow-lg">
                              {/* Header */}
                              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-700/50">
                                <div className="bg-orange-900/40 p-2 rounded-lg">
                                  <Wrench className="w-5 h-5 text-orange-400" />
                                </div>
                                <div className="flex-1">
                                  <div className="text-base text-orange-300 font-bold">{tool.message.toolName || tool.name}</div>
                                  {tool.timestamp && (
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      {formatTimestamp(tool.timestamp)}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-4">
                                {/* Tool Input - find from tool_use block in message content */}
                                {(() => {
                                  let toolInput = null
                                  let toolUseId = null

                                  // Check if this message has tool_use blocks
                                  if (tool.message.message?.content && Array.isArray(tool.message.message.content)) {
                                    for (const block of tool.message.message.content) {
                                      if (block.type === 'tool_use' && block.name === tool.name) {
                                        toolInput = block.input
                                        toolUseId = block.id
                                        break
                                      }
                                    }
                                  }

                                  return toolInput ? (
                                    <div>
                                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-orange-700/30">
                                        <Terminal className="w-4 h-4 text-blue-400" />
                                        <span className="text-sm font-semibold text-blue-300">Input</span>
                                      </div>
                                      <pre className="text-xs bg-gray-950/70 p-3 rounded border border-gray-800 overflow-x-auto text-gray-300 max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
                                        {JSON.stringify(toolInput, null, 2)}
                                      </pre>
                                    </div>
                                  ) : null
                                })()}

                                {/* Tool Result - find in subsequent messages */}
                                {(() => {
                                  // Find tool_use_id from this tool
                                  let toolUseId = null
                                  if (tool.message.message?.content && Array.isArray(tool.message.message.content)) {
                                    for (const block of tool.message.message.content) {
                                      if (block.type === 'tool_use' && block.name === tool.name) {
                                        toolUseId = block.id
                                        break
                                      }
                                    }
                                  }

                                  // Look for the result in following messages
                                  if (toolUseId) {
                                    for (let i = tool.messageIndex + 1; i < messages.length; i++) {
                                      const resultMsg = messages[i]
                                      if (resultMsg.message?.content && Array.isArray(resultMsg.message.content)) {
                                        for (const block of resultMsg.message.content) {
                                          if (block.type === 'tool_result' && block.tool_use_id === toolUseId) {
                                            return (
                                              <div>
                                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-orange-700/30">
                                                  <FileCode className="w-4 h-4 text-green-400" />
                                                  <span className="text-sm font-semibold text-green-300">Result</span>
                                                </div>
                                                <pre className="text-xs bg-gray-950/70 p-3 rounded border border-gray-800 overflow-x-auto text-gray-300 max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
                                                  {typeof block.content === 'string'
                                                    ? block.content
                                                    : JSON.stringify(block.content, null, 2)}
                                                </pre>
                                              </div>
                                            )
                                          }
                                        }
                                      }
                                    }
                                  }
                                  return null
                                })()}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })

              return chatBubbles
            })()}
          </div>
        )}

        {!loading && !error && messages.length > 0 && viewMode === 'list' && (
          <div className="p-6 space-y-4">
            {messages.map((message, index) => {
              const isMatch = messageMatchesSearch(message)
              const isCurrentMatch = searchQuery.trim() && matchIndices[currentMatchIndex] === index

              return (
              <div
                key={index}
                ref={(el) => { messageRefs.current[index] = el }}
                className={`rounded-lg border ${
                  isCurrentMatch
                    ? 'ring-2 ring-blue-500 shadow-lg shadow-blue-500/20'
                    : isMatch
                    ? 'ring-1 ring-yellow-500/50'
                    : ''
                } ${
                  hasToolResults(message)
                    ? 'bg-yellow-900/20 border-yellow-800/50'
                    : isSystemMessage(message)
                    ? 'bg-gray-800/50 border-gray-700/50'
                    : message.type === 'skill'
                    ? 'bg-cyan-900/20 border-cyan-800/50'
                    : message.type === 'thinking'
                    ? 'bg-purple-900/20 border-purple-700/40'
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
                      ) : message.type === 'skill' ? (
                        <>
                          <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-cyan-300">Skill Expansion</span>
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
                      ) : message.type === 'thinking' ? (
                        <>
                          <MessageCircle className="w-4 h-4 text-purple-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-purple-300">Thinking</span>
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          copyMessageToClipboard(message, index)
                        }}
                        className="p-1 rounded transition-colors hover:bg-gray-700 text-gray-400"
                        title="Copy message to clipboard"
                      >
                        {copiedMessageIndex === index ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
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
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

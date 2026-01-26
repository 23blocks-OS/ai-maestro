'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Mail, Send, Inbox, Archive, Trash2, AlertCircle, Clock, CheckCircle, Forward, Copy, ChevronDown, Server, ShieldCheck, Globe, HelpCircle, ExternalLink } from 'lucide-react'
import type { Message, MessageSummary } from '@/lib/messageQueue'

/**
 * Agent recipient info for messaging
 */
export interface AgentRecipient {
  id: string              // Agent ID (UUID)
  name: string            // Technical name for lookups (e.g., "23blocks-api-crm")
  alias: string           // Display name for UI (e.g., "CRM")
  tmuxSessionName?: string // Tmux session name (for backward compatibility)
  hostId?: string         // Host ID for cross-host messaging (e.g., 'macbook-pro', 'mac-mini')
}

interface MessageCenterProps {
  sessionName: string
  agentId?: string  // Primary identifier when available
  allAgents: AgentRecipient[]
  isVisible?: boolean
  hostUrl?: string  // Base URL for remote hosts (e.g., http://100.80.12.6:23000)
}

export default function MessageCenter({ sessionName, agentId, allAgents, isVisible = true, hostUrl }: MessageCenterProps) {
  // Use agentId as primary identifier if available, fall back to sessionName
  const messageIdentifier = agentId || sessionName
  // Base URL for API calls - empty for local, full URL for remote hosts
  const apiBaseUrl = hostUrl || ''
  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [sentMessages, setSentMessages] = useState<MessageSummary[]>([])
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [view, setView] = useState<'inbox' | 'sent' | 'compose'>('inbox')
  const [unreadCount, setUnreadCount] = useState(0)
  const [sentCount, setSentCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)
  const [isForwarding, setIsForwarding] = useState(false)
  const [forwardingOriginalMessage, setForwardingOriginalMessage] = useState<Message | null>(null)

  // Compose form state
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeMessage, setComposeMessage] = useState('')
  const [composePriority, setComposePriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal')
  const [composeType, setComposeType] = useState<'request' | 'response' | 'notification' | 'update'>('request')

  // Copy dropdown state
  const [showCopyDropdown, setShowCopyDropdown] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  // Agent autocomplete state
  const [showAgentSuggestions, setShowAgentSuggestions] = useState(false)
  const [filteredAgents, setFilteredAgents] = useState<AgentRecipient[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const toInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // External agent info toggle
  const [showExternalAgentInfo, setShowExternalAgentInfo] = useState(false)

  // Fetch inbox messages
  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/messages?agent=${encodeURIComponent(messageIdentifier)}&box=inbox`)
      const data = await response.json()
      setMessages(data.messages || [])
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
  }, [messageIdentifier, apiBaseUrl])

  // Fetch sent messages
  const fetchSentMessages = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/messages?agent=${encodeURIComponent(messageIdentifier)}&box=sent`)
      const data = await response.json()
      setSentMessages(data.messages || [])
    } catch (error) {
      console.error('Error fetching sent messages:', error)
    }
  }, [messageIdentifier, apiBaseUrl])

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/messages?agent=${encodeURIComponent(messageIdentifier)}&action=unread-count`)
      const data = await response.json()
      setUnreadCount(data.count || 0)
    } catch (error) {
      console.error('Error fetching unread count:', error)
    }
  }, [messageIdentifier, apiBaseUrl])

  // Fetch sent count
  const fetchSentCount = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/messages?agent=${encodeURIComponent(messageIdentifier)}&action=sent-count`)
      const data = await response.json()
      setSentCount(data.count || 0)
    } catch (error) {
      console.error('Error fetching sent count:', error)
    }
  }, [messageIdentifier, apiBaseUrl])

  // Load message details
  const loadMessage = async (messageId: string, box: 'inbox' | 'sent' = 'inbox') => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/messages?agent=${encodeURIComponent(messageIdentifier)}&id=${messageId}&box=${box}`)
      const message = await response.json()
      setSelectedMessage(message)

      // Mark as read if unread (inbox only)
      if (box === 'inbox' && message.status === 'unread') {
        await fetch(`${apiBaseUrl}/api/messages?agent=${encodeURIComponent(messageIdentifier)}&id=${messageId}&action=read`, {
          method: 'PATCH',
        })
        fetchMessages()
        fetchUnreadCount()
      }
    } catch (error) {
      console.error('Error loading message:', error)
    }
  }

  // Send message
  const sendMessage = async () => {
    if (!composeTo || !composeSubject || !composeMessage) {
      alert('Please fill in all fields')
      return
    }

    setLoading(true)
    try {
      // If forwarding, use the forward API
      if (isForwarding && forwardingOriginalMessage) {
        // Extract the note from the message (everything before "--- Forwarded Message ---")
        const forwardNote = composeMessage.split('--- Forwarded Message ---')[0].trim()

        const response = await fetch(`${apiBaseUrl}/api/messages/forward`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: forwardingOriginalMessage.id,
            fromSession: sessionName,
            toSession: composeTo,
            forwardNote: forwardNote || undefined,
          }),
        })

        if (response.ok) {
          // Reset form
          setComposeTo('')
          setComposeSubject('')
          setComposeMessage('')
          setComposePriority('normal')
          setComposeType('request')
          setIsForwarding(false)
          setForwardingOriginalMessage(null)
          setView('inbox')
          alert('Message forwarded successfully!')
          fetchMessages()
          fetchUnreadCount()
        } else {
          const error = await response.json()
          alert(`Failed to forward message: ${error.error}`)
        }
      } else {
        // Regular message send
        const response = await fetch(`${apiBaseUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: sessionName,
            to: composeTo,
            subject: composeSubject,
            priority: composePriority,
            content: {
              type: composeType,
              message: composeMessage,
            },
          }),
        })

        if (response.ok) {
          // Reset form
          setComposeTo('')
          setComposeSubject('')
          setComposeMessage('')
          setComposePriority('normal')
          setComposeType('request')
          setView('inbox')
          alert('Message sent successfully!')
        } else {
          alert('Failed to send message')
        }
      }
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Error sending message')
    } finally {
      setLoading(false)
    }
  }

  // Delete message
  const deleteMessage = async (messageId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return

    try {
      await fetch(`${apiBaseUrl}/api/messages?agent=${encodeURIComponent(messageIdentifier)}&id=${messageId}`, {
        method: 'DELETE',
      })
      setSelectedMessage(null)
      fetchMessages()
      fetchUnreadCount()
    } catch (error) {
      console.error('Error deleting message:', error)
    }
  }

  // Archive message
  const archiveMessage = async (messageId: string) => {
    try {
      await fetch(`${apiBaseUrl}/api/messages?agent=${encodeURIComponent(messageIdentifier)}&id=${messageId}&action=archive`, {
        method: 'PATCH',
      })
      setSelectedMessage(null)
      fetchMessages()
      fetchUnreadCount()
    } catch (error) {
      console.error('Error archiving message:', error)
    }
  }

  // Copy message to clipboard (regular format)
  const copyMessageRegular = async () => {
    if (!selectedMessage) return

    try {
      await navigator.clipboard.writeText(selectedMessage.content.message)
      setCopySuccess(true)
      setShowCopyDropdown(false)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (error) {
      console.error('Error copying message:', error)
    }
  }

  // Copy message to clipboard (LLM-friendly markdown format)
  const copyMessageForLLM = async () => {
    if (!selectedMessage) return

    // Format message in markdown for LLM consumption
    const isInboxMessage = view === 'inbox'
    let markdown = `# Message: ${selectedMessage.subject}\n\n`

    if (isInboxMessage) {
      markdown += `**From:** ${formatAgentName(selectedMessage.from, selectedMessage.fromAlias, selectedMessage.fromHost)}\n`
      markdown += `**To:** ${sessionName}\n`
    } else {
      markdown += `**From:** ${sessionName}\n`
      markdown += `**To:** ${formatAgentName(selectedMessage.to, selectedMessage.toAlias, selectedMessage.toHost)}\n`
    }

    markdown += `**Date:** ${new Date(selectedMessage.timestamp).toLocaleString()}\n`
    markdown += `**Priority:** ${selectedMessage.priority}\n`
    markdown += `**Type:** ${selectedMessage.content.type}\n\n`

    markdown += `## Message Content\n\n`
    markdown += `${selectedMessage.content.message}\n`

    if (selectedMessage.content.context) {
      markdown += `\n## Context\n\n`
      markdown += '```json\n'
      markdown += JSON.stringify(selectedMessage.content.context, null, 2)
      markdown += '\n```\n'
    }

    if (selectedMessage.forwardedFrom) {
      markdown += `\n## Forwarding Information\n\n`
      markdown += `**Originally From:** ${selectedMessage.forwardedFrom.originalFrom}\n`
      markdown += `**Originally To:** ${selectedMessage.forwardedFrom.originalTo}\n`
      markdown += `**Original Date:** ${new Date(selectedMessage.forwardedFrom.originalTimestamp).toLocaleString()}\n`
      markdown += `**Forwarded By:** ${selectedMessage.forwardedFrom.forwardedBy}\n`
      markdown += `**Forwarded At:** ${new Date(selectedMessage.forwardedFrom.forwardedAt).toLocaleString()}\n`
      if (selectedMessage.forwardedFrom.forwardNote) {
        markdown += `**Forward Note:** ${selectedMessage.forwardedFrom.forwardNote}\n`
      }
    }

    try {
      await navigator.clipboard.writeText(markdown)
      setCopySuccess(true)
      setShowCopyDropdown(false)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (error) {
      console.error('Error copying message:', error)
    }
  }

  // Prepare to forward message
  const prepareForward = (message: Message) => {
    // Build forwarded content with human-readable agent names
    const fromDisplay = formatAgentName(message.from, message.fromAlias, message.fromHost)
    const toDisplay = formatAgentName(message.to, message.toAlias, message.toHost)
    let forwardedContent = `--- Forwarded Message ---\n`
    forwardedContent += `From: ${fromDisplay}\n`
    forwardedContent += `To: ${toDisplay}\n`
    forwardedContent += `Sent: ${new Date(message.timestamp).toLocaleString()}\n`
    forwardedContent += `Subject: ${message.subject}\n\n`
    forwardedContent += `${message.content.message}\n`
    forwardedContent += `--- End of Forwarded Message ---`

    // Set compose form for forwarding
    setComposeTo('')
    setComposeSubject(`Fwd: ${message.subject}`)
    setComposeMessage(forwardedContent)
    setComposePriority(message.priority)
    setComposeType('notification')
    setIsForwarding(true)
    setForwardingOriginalMessage(message)
    setView('compose')
  }

  // Only fetch messages when visible for the first time, then set up polling
  useEffect(() => {
    if (!isVisible || hasInitialized) return

    setHasInitialized(true)
    fetchMessages()
    fetchSentMessages()
    fetchUnreadCount()
    fetchSentCount()
  }, [isVisible, hasInitialized, fetchMessages, fetchSentMessages, fetchUnreadCount, fetchSentCount])

  // Set up polling interval only when visible
  useEffect(() => {
    if (!isVisible || !hasInitialized) return

    const interval = setInterval(() => {
      fetchMessages()
      fetchSentMessages()
      fetchUnreadCount()
      fetchSentCount()
    }, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
  }, [isVisible, hasInitialized, fetchMessages, fetchSentMessages, fetchUnreadCount, fetchSentCount])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.relative')) {
        setShowCopyDropdown(false)
      }
    }

    if (showCopyDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showCopyDropdown])

  // Filter agents based on input for autocomplete
  useEffect(() => {
    if (!composeTo) {
      setFilteredAgents([])
      setShowAgentSuggestions(false)
      return
    }

    const searchTerm = composeTo.toLowerCase()
    // Filter out current agent and match by alias or host
    const filtered = allAgents.filter(agent => {
      if (agent.id === agentId) return false
      const aliasMatch = agent.alias.toLowerCase().includes(searchTerm)
      const hostMatch = agent.hostId?.toLowerCase().includes(searchTerm)
      const fullMatch = `${agent.alias}@${agent.hostId || 'unknown-host'}`.toLowerCase().includes(searchTerm)
      return aliasMatch || hostMatch || fullMatch
    })

    setFilteredAgents(filtered)
    setShowAgentSuggestions(filtered.length > 0)
    setSelectedSuggestionIndex(-1)
  }, [composeTo, allAgents, agentId])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (
        toInputRef.current && !toInputRef.current.contains(target) &&
        suggestionsRef.current && !suggestionsRef.current.contains(target)
      ) {
        setShowAgentSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle keyboard navigation in autocomplete
  const handleToKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showAgentSuggestions || filteredAgents.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev < filteredAgents.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedSuggestionIndex >= 0) {
          selectAgent(filteredAgents[selectedSuggestionIndex])
        }
        break
      case 'Escape':
        setShowAgentSuggestions(false)
        break
    }
  }

  // Select an agent from suggestions
  const selectAgent = (agent: AgentRecipient) => {
    // Use technical name for messaging, include host for cross-host compatibility
    const hostId = agent.hostId || 'unknown-host'
    const value = `${agent.name}@${hostId}`
    setComposeTo(value)
    setShowAgentSuggestions(false)
    setSelectedSuggestionIndex(-1)
  }

  // Format agent display with host indicator
  const formatAgentDisplay = (agent: AgentRecipient) => {
    const hostId = agent.hostId || 'unknown-host'
    return {
      primary: agent.alias,
      secondary: `@${hostId}`,
      hasHost: !!agent.hostId
    }
  }

  // Format agent display name - prefer alias over UUID, always include host
  const formatAgentName = (agentId: string, alias?: string, host?: string) => {
    const displayName = alias || agentId
    const hostName = host || 'unknown-host'
    return `${displayName}@${hostName}`
  }

  // Get agent display parts - display name and technical address separately
  const getAgentDisplayParts = (agentId: string, alias?: string, host?: string) => {
    const displayName = alias || agentId
    const hostName = host || 'unknown-host'
    const technicalAddress = `${agentId}@${hostName}`
    return { displayName, technicalAddress }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100'
      case 'high': return 'text-orange-600 bg-orange-100'
      case 'normal': return 'text-blue-600 bg-blue-100'
      case 'low': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent': return <AlertCircle className="w-4 h-4" />
      case 'high': return <Clock className="w-4 h-4" />
      default: return null
    }
  }

  // Check if the "To" field looks like an external agent (not in autocomplete list)
  const isExternalRecipient = (toValue: string): boolean => {
    if (!toValue) return false
    // If it matches any agent in the list, it's not external
    const matchesAgent = allAgents.some(agent =>
      agent.name.toLowerCase() === toValue.toLowerCase() ||
      agent.alias.toLowerCase() === toValue.toLowerCase() ||
      `${agent.name}@${agent.hostId || 'unknown-host'}`.toLowerCase() === toValue.toLowerCase() ||
      `${agent.alias}@${agent.hostId || 'unknown-host'}`.toLowerCase() === toValue.toLowerCase()
    )
    return !matchesAgent && toValue.length > 0
  }

  return (
    <div className="flex flex-col h-full w-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-gray-300" />
          <button
            onClick={() => setShowExternalAgentInfo(!showExternalAgentInfo)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
            title="Learn about messaging AI Maestro and external agents"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Agent Types
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('inbox')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'inbox'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Inbox className="w-4 h-4 inline-block mr-1" />
            Inbox
            {unreadCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-bold text-white bg-red-500 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setView('sent')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'sent'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Send className="w-4 h-4 inline-block mr-1" />
            Sent
          </button>
          <button
            onClick={() => setView('compose')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'compose'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Send className="w-4 h-4 inline-block mr-1" />
            Compose
          </button>
        </div>
      </div>

      {/* Agent Types Info Panel */}
      {showExternalAgentInfo && (
        <div className="p-4 bg-gradient-to-r from-gray-800 to-gray-850 border-b border-gray-700">
          <div className="flex items-start gap-4">
            <div className="flex-1 grid grid-cols-2 gap-4">
              {/* AI Maestro Agents */}
              <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
                  </div>
                  <span className="text-sm font-medium text-green-400">AI Maestro Agents</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  Registered agents in your AI Maestro network. These appear in autocomplete when composing messages.
                </p>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 bg-green-500 rounded-full"></span>
                    Local agents on this machine
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 bg-green-500 rounded-full"></span>
                    Network agents on other hosts
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 bg-green-500 rounded-full"></span>
                    Push notifications supported
                  </li>
                </ul>
              </div>

              {/* External Agents */}
              <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <Globe className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-blue-400">External Agents</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  Agents outside AI Maestro that use the messaging API. Type their address manually in compose.
                </p>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
                    Custom Claude Code agents
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
                    Third-party integrations
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
                    Use format: <code className="bg-gray-800 px-1 rounded">name@host</code>
                  </li>
                </ul>
              </div>
            </div>
            <button
              onClick={() => setShowExternalAgentInfo(false)}
              className="text-gray-500 hover:text-gray-300 p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Inbox View */}
      {view === 'inbox' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Message List */}
          <div className="w-1/3 border-r border-gray-700 bg-gray-800 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Inbox className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No inbox messages</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  onClick={() => loadMessage(msg.id)}
                  className={`p-4 border-b border-gray-700 cursor-pointer hover:bg-gray-700 transition-colors ${
                    msg.status === 'unread' ? 'bg-blue-900/30' : ''
                  } ${selectedMessage?.id === msg.id ? 'bg-blue-900/50' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-2">
                      {/* Verified/External indicator */}
                      <div className="mt-0.5">
                        {msg.fromVerified !== false ? (
                          <span title="AI Maestro Agent">
                            <ShieldCheck className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                          </span>
                        ) : (
                          <span title="External Agent">
                            <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold truncate ${msg.status === 'unread' ? 'text-gray-100' : 'text-gray-300'}`}>
                            {(msg as any).fromLabel || msg.fromAlias || msg.from}
                          </span>
                          {getPriorityIcon(msg.priority)}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {msg.fromAlias || msg.from}@{msg.fromHost || 'unknown-host'}
                        </div>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${getPriorityColor(msg.priority)}`}>
                      {msg.priority}
                    </span>
                  </div>
                  <h3 className={`text-sm mb-1 ${msg.status === 'unread' ? 'font-semibold text-gray-200' : 'font-medium text-gray-300'}`}>
                    {msg.subject}
                  </h3>
                  <p className="text-xs text-gray-400 line-clamp-2">{msg.preview}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                    {msg.status === 'unread' && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Message Detail */}
          <div className="flex-1 bg-gray-900 overflow-y-auto">
            {selectedMessage ? (
              <div className="p-6">
                <div className="flex items-start justify-between mb-4 gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-gray-100 mb-3">
                      {selectedMessage.subject}
                    </h2>
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-sm text-gray-400 mt-0.5 flex-shrink-0">From:</span>
                      {/* Verified/External indicator */}
                      <span
                        className={`flex items-center mt-0.5 flex-shrink-0 ${(selectedMessage as any).fromVerified !== false ? 'text-green-400' : 'text-blue-400'}`}
                        title={(selectedMessage as any).fromVerified !== false ? 'AI Maestro Agent' : 'External Agent'}
                      >
                        {(selectedMessage as any).fromVerified !== false ? (
                          <ShieldCheck className="w-4 h-4" />
                        ) : (
                          <Globe className="w-4 h-4" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-200 truncate">
                          {(selectedMessage as any).fromLabel || selectedMessage.fromAlias || selectedMessage.from}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="truncate">{selectedMessage.fromAlias || selectedMessage.from}@{selectedMessage.fromHost || 'unknown-host'}</span>
                          <span className="flex-shrink-0">•</span>
                          <span className="flex-shrink-0">{new Date(selectedMessage.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {/* Copy Button with Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setShowCopyDropdown(!showCopyDropdown)}
                        className={`p-2 rounded-md transition-colors flex items-center gap-1 ${
                          copySuccess
                            ? 'text-green-400 bg-green-900/30'
                            : 'text-gray-400 hover:bg-gray-800'
                        }`}
                        title="Copy Message"
                      >
                        <Copy className="w-5 h-5" />
                        <ChevronDown className="w-3 h-3" />
                      </button>

                      {showCopyDropdown && (
                        <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10">
                          <button
                            onClick={copyMessageRegular}
                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors flex items-center gap-2"
                          >
                            <Copy className="w-4 h-4" />
                            Copy Message
                          </button>
                          <button
                            onClick={copyMessageForLLM}
                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors flex items-center gap-2"
                          >
                            <Copy className="w-4 h-4" />
                            Copy for LLM
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => prepareForward(selectedMessage)}
                      className="p-2 text-blue-400 hover:bg-blue-900/30 rounded-md transition-colors"
                      title="Forward"
                    >
                      <Forward className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => archiveMessage(selectedMessage.id)}
                      className="p-2 text-gray-400 hover:bg-gray-800 rounded-md transition-colors"
                      title="Archive"
                    >
                      <Archive className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => deleteMessage(selectedMessage.id)}
                      className="p-2 text-red-400 hover:bg-red-900/30 rounded-md transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(selectedMessage.priority)}`}>
                    {selectedMessage.priority}
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-600">
                    {selectedMessage.content.type}
                  </span>
                </div>

                <div className="prose max-w-none">
                  <div className="p-4 bg-gray-800 rounded-lg mb-4">
                    <pre className="whitespace-pre-wrap text-sm text-gray-200 font-sans">
                      {selectedMessage.content.message}
                    </pre>
                  </div>

                  {selectedMessage.content.context && (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold text-gray-300 mb-2">Context:</h3>
                      <pre className="p-3 bg-gray-800 rounded text-xs overflow-x-auto text-gray-300">
                        {JSON.stringify(selectedMessage.content.context, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-gray-800 flex gap-3">
                  <button
                    onClick={() => {
                      // Use alias for reply if available, with host suffix for remote agents
                      setComposeTo(formatAgentName(selectedMessage.from, selectedMessage.fromAlias, selectedMessage.fromHost))
                      setComposeSubject(`Re: ${selectedMessage.subject}`)
                      setComposeType('response')
                      setIsForwarding(false)
                      setForwardingOriginalMessage(null)
                      setView('compose')
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    <Send className="w-4 h-4 inline-block mr-2" />
                    Reply
                  </button>
                  <button
                    onClick={() => prepareForward(selectedMessage)}
                    className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
                  >
                    <Forward className="w-4 h-4 inline-block mr-2" />
                    Forward
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <Mail className="w-16 h-16 mx-auto mb-2 text-gray-600" />
                  <p>Select a message to read</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sent Messages View */}
      {view === 'sent' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Message List */}
          <div className="w-1/3 border-r border-gray-700 bg-gray-800 overflow-y-auto">
            {sentMessages.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Send className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No sent messages</p>
              </div>
            ) : (
              sentMessages.map((msg) => (
                <div
                  key={msg.id}
                  onClick={() => loadMessage(msg.id, 'sent')}
                  className={`p-4 border-b border-gray-700 cursor-pointer hover:bg-gray-700 transition-colors ${
                    selectedMessage?.id === msg.id ? 'bg-blue-900/50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-green-400 font-medium mt-0.5">To:</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-300 truncate">
                            {(msg as any).toLabel || msg.toAlias || msg.to}
                          </span>
                          {getPriorityIcon(msg.priority)}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {msg.toAlias || msg.to}@{msg.toHost || 'unknown-host'}
                        </div>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${getPriorityColor(msg.priority)}`}>
                      {msg.priority}
                    </span>
                  </div>
                  <h3 className="text-sm mb-1 font-medium text-gray-300">
                    {msg.subject}
                  </h3>
                  <p className="text-xs text-gray-400 line-clamp-2">{msg.preview}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                    <CheckCircle className="w-3 h-3 text-green-500" />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Message Detail */}
          <div className="flex-1 bg-gray-900 overflow-y-auto">
            {selectedMessage ? (
              <div className="p-6">
                <div className="flex items-start justify-between mb-4 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="text-sm text-green-400 font-medium">Sent Message</span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-100 mb-3">
                      {selectedMessage.subject}
                    </h2>
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-sm text-gray-400 mt-0.5 flex-shrink-0">To:</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-200 truncate">
                          {(selectedMessage as any).toLabel || selectedMessage.toAlias || selectedMessage.to}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="truncate">{selectedMessage.toAlias || selectedMessage.to}@{selectedMessage.toHost || 'unknown-host'}</span>
                          <span className="flex-shrink-0">•</span>
                          <span className="flex-shrink-0">{new Date(selectedMessage.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {/* Copy Button with Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setShowCopyDropdown(!showCopyDropdown)}
                        className={`p-2 rounded-md transition-colors flex items-center gap-1 ${
                          copySuccess
                            ? 'text-green-400 bg-green-900/30'
                            : 'text-gray-400 hover:bg-gray-800'
                        }`}
                        title="Copy Message"
                      >
                        <Copy className="w-5 h-5" />
                        <ChevronDown className="w-3 h-3" />
                      </button>

                      {showCopyDropdown && (
                        <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10">
                          <button
                            onClick={copyMessageRegular}
                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors flex items-center gap-2"
                          >
                            <Copy className="w-4 h-4" />
                            Copy Message
                          </button>
                          <button
                            onClick={copyMessageForLLM}
                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors flex items-center gap-2"
                          >
                            <Copy className="w-4 h-4" />
                            Copy for LLM
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(selectedMessage.priority)}`}>
                    {selectedMessage.priority}
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-600">
                    {selectedMessage.content.type}
                  </span>
                </div>

                <div className="prose max-w-none">
                  <div className="p-4 bg-gray-800 rounded-lg mb-4">
                    <pre className="whitespace-pre-wrap text-sm text-gray-200 font-sans">
                      {selectedMessage.content.message}
                    </pre>
                  </div>

                  {selectedMessage.content.context && (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold text-gray-300 mb-2">Context:</h3>
                      <pre className="p-3 bg-gray-800 rounded text-xs overflow-x-auto text-gray-300">
                        {JSON.stringify(selectedMessage.content.context, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <Send className="w-16 h-16 mx-auto mb-2 text-gray-600" />
                  <p>Select a sent message to view</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compose View */}
      {view === 'compose' && (
        <div className="flex-1 bg-gray-900 p-6 overflow-y-auto">
          <h2 className="text-xl font-bold text-gray-100 mb-6">
            {isForwarding ? 'Forward Message' : 'Compose Message'}
          </h2>

          {isForwarding && (
            <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded-md">
              <p className="text-sm text-blue-300">
                <Forward className="w-4 h-4 inline-block mr-1" />
                Forwarding message from <strong>{forwardingOriginalMessage ? formatAgentName(forwardingOriginalMessage.from, forwardingOriginalMessage.fromAlias, forwardingOriginalMessage.fromHost) : ''}</strong>
              </p>
              <p className="text-xs text-blue-400 mt-1">
                You can add a note at the top of the message before the forwarded content.
              </p>
            </div>
          )}

          <div className="space-y-4 max-w-2xl">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                To (Agent Name):
              </label>
              <input
                ref={toInputRef}
                id="compose-to"
                name="to"
                type="text"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                onKeyDown={handleToKeyDown}
                onFocus={() => composeTo && filteredAgents.length > 0 && setShowAgentSuggestions(true)}
                autoComplete="off"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Type agent name or agent@host"
              />

              {/* Autocomplete suggestions dropdown */}
              {showAgentSuggestions && filteredAgents.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto"
                >
                  {filteredAgents.map((agent, index) => {
                    const display = formatAgentDisplay(agent)
                    const isSelected = index === selectedSuggestionIndex
                    return (
                      <div
                        key={agent.id}
                        onClick={() => selectAgent(agent)}
                        className={`px-3 py-2 cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-gray-700 text-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{display.primary}</span>
                          <span className={`text-sm ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
                            {display.secondary}
                          </span>
                        </div>
                        {display.hasHost && (
                          <Server className={`w-4 h-4 ${isSelected ? 'text-blue-200' : 'text-gray-500'}`} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* External agent indicator */}
              {isExternalRecipient(composeTo) ? (
                <div className="mt-2 flex items-center gap-2 p-2 bg-blue-900/30 border border-blue-700/50 rounded-md">
                  <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="text-xs">
                    <span className="text-blue-300 font-medium">External Agent</span>
                    <span className="text-blue-400/70 ml-1">— This agent is not registered in AI Maestro. The message will be sent via API.</span>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-xs text-gray-500">
                  Type to search AI Maestro agents, or enter <code className="bg-gray-800 px-1 rounded">agent@host</code> for external agents.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Subject:
              </label>
              <input
                id="compose-subject"
                name="subject"
                type="text"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter subject"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Priority:
                </label>
                <select
                  value={composePriority}
                  onChange={(e) => setComposePriority(e.target.value as any)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Type:
                </label>
                <select
                  value={composeType}
                  onChange={(e) => setComposeType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="request">Request</option>
                  <option value="response">Response</option>
                  <option value="notification">Notification</option>
                  <option value="update">Update</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Message:
              </label>
              <textarea
                id="compose-message"
                name="message"
                value={composeMessage}
                onChange={(e) => setComposeMessage(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="Enter your message..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={sendMessage}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (isForwarding ? 'Forwarding...' : 'Sending...') : (isForwarding ? 'Forward Message' : 'Send Message')}
              </button>
              <button
                onClick={() => {
                  setView('inbox')
                  setIsForwarding(false)
                  setForwardingOriginalMessage(null)
                }}
                className="px-6 py-2 bg-gray-700 text-gray-200 rounded-md hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

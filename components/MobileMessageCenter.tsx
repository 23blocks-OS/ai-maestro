'use client'

import { useState, useEffect, useCallback } from 'react'
import { Send, Inbox, Archive, Trash2, AlertCircle, Clock, CheckCircle, Forward, Copy, ChevronDown, Edit, MoreVertical } from 'lucide-react'
import type { Message, MessageSummary } from '@/lib/messageQueue'
import type { AgentRecipient } from './MessageCenter'

interface MobileMessageCenterProps {
  sessionName: string
  agentId?: string  // Primary identifier when available
  allAgents: AgentRecipient[]
  hostUrl?: string  // Base URL for remote hosts (e.g., http://100.80.12.6:23000)
}

export default function MobileMessageCenter({ sessionName, agentId, allAgents, hostUrl }: MobileMessageCenterProps) {
  // Use agentId as primary identifier if available, fall back to sessionName
  const messageIdentifier = agentId || sessionName
  // Base URL for API calls - empty for local, full URL for remote hosts
  const apiBaseUrl = hostUrl || ''
  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [sentMessages, setSentMessages] = useState<MessageSummary[]>([])
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [view, setView] = useState<'inbox' | 'sent' | 'compose'>('inbox')
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
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

  // Message actions dropdown
  const [showActionsMenu, setShowActionsMenu] = useState(false)

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
      if (isForwarding && forwardingOriginalMessage) {
        const forwardNote = composeMessage.split('--- Forwarded Message ---')[0].trim()

        const response = await fetch(`${apiBaseUrl}/api/messages/forward`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: forwardingOriginalMessage.id,
            fromSession: messageIdentifier,
            toSession: composeTo,
            forwardNote: forwardNote || undefined,
          }),
        })

        if (response.ok) {
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
        const response = await fetch(`${apiBaseUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: messageIdentifier,
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
      setShowActionsMenu(false)
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
      setShowActionsMenu(false)
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
      setShowActionsMenu(false)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (error) {
      console.error('Error copying message:', error)
    }
  }

  // Copy message to clipboard (LLM-friendly markdown format)
  const copyMessageForLLM = async () => {
    if (!selectedMessage) return

    const isInboxMessage = view === 'inbox'
    let markdown = `# Message: ${selectedMessage.subject}\n\n`

    if (isInboxMessage) {
      markdown += `**From:** ${selectedMessage.from}\n`
      markdown += `**To:** ${messageIdentifier}\n`
    } else {
      markdown += `**From:** ${messageIdentifier}\n`
      markdown += `**To:** ${selectedMessage.to}\n`
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

    try {
      await navigator.clipboard.writeText(markdown)
      setCopySuccess(true)
      setShowCopyDropdown(false)
      setShowActionsMenu(false)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (error) {
      console.error('Error copying message:', error)
    }
  }

  // Prepare to forward message
  const prepareForward = (message: Message) => {
    let forwardedContent = `--- Forwarded Message ---\n`
    forwardedContent += `From: ${message.from}\n`
    forwardedContent += `To: ${message.to}\n`
    forwardedContent += `Sent: ${new Date(message.timestamp).toLocaleString()}\n`
    forwardedContent += `Subject: ${message.subject}\n\n`
    forwardedContent += `${message.content.message}\n`
    forwardedContent += `--- End of Forwarded Message ---`

    setComposeTo('')
    setComposeSubject(`Fwd: ${message.subject}`)
    setComposeMessage(forwardedContent)
    setComposePriority(message.priority)
    setComposeType('notification')
    setIsForwarding(true)
    setForwardingOriginalMessage(message)
    setShowActionsMenu(false)
    setView('compose')
  }

  useEffect(() => {
    fetchMessages()
    fetchSentMessages()
    fetchUnreadCount()
    const interval = setInterval(() => {
      fetchMessages()
      fetchSentMessages()
      fetchUnreadCount()
    }, 10000)
    return () => clearInterval(interval)
  }, [messageIdentifier, fetchMessages, fetchSentMessages, fetchUnreadCount])

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-900/30'
      case 'high': return 'text-orange-600 bg-orange-900/30'
      case 'normal': return 'text-blue-600 bg-blue-900/30'
      case 'low': return 'text-gray-600 bg-gray-800'
      default: return 'text-gray-600 bg-gray-800'
    }
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent': return <AlertCircle className="w-3 h-3" />
      case 'high': return <Clock className="w-3 h-3" />
      default: return null
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-gray-900">
      {/* Header - Navigation Tabs Only */}
      <div className="flex-shrink-0 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center justify-around">
          <button
            onClick={() => { setView('inbox'); setSelectedMessage(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              view === 'inbox'
                ? 'text-blue-400 bg-gray-800/50 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Inbox className="w-4 h-4" />
            Inbox
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-bold text-white bg-red-500 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setView('sent'); setSelectedMessage(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              view === 'sent'
                ? 'text-blue-400 bg-gray-800/50 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Send className="w-4 h-4" />
            Sent
          </button>
          <button
            onClick={() => { setView('compose'); setSelectedMessage(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              view === 'compose'
                ? 'text-blue-400 bg-gray-800/50 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Edit className="w-4 h-4" />
            Compose
          </button>
        </div>
      </div>

      {/* Inbox View */}
      {view === 'inbox' && !selectedMessage && (
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <Inbox className="w-16 h-16 text-gray-600 mb-4" />
              <p className="text-sm text-gray-400">No inbox messages</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {messages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => loadMessage(msg.id)}
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    msg.status === 'unread' ? 'bg-blue-900/20' : ''
                  } hover:bg-gray-800/50 active:bg-gray-800`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-sm font-semibold truncate ${msg.status === 'unread' ? 'text-gray-100' : 'text-gray-300'}`}>
                        {msg.from}
                      </span>
                      {getPriorityIcon(msg.priority)}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${getPriorityColor(msg.priority)}`}>
                      {msg.priority}
                    </span>
                  </div>
                  <h3 className={`text-sm mb-1 truncate ${msg.status === 'unread' ? 'font-semibold text-gray-200' : 'font-medium text-gray-300'}`}>
                    {msg.subject}
                  </h3>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-2">{msg.preview}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                    {msg.status === 'unread' && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sent View */}
      {view === 'sent' && !selectedMessage && (
        <div className="flex-1 overflow-y-auto">
          {sentMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <Send className="w-16 h-16 text-gray-600 mb-4" />
              <p className="text-sm text-gray-400">No sent messages</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {sentMessages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => loadMessage(msg.id, 'sent')}
                  className="w-full px-4 py-3 text-left hover:bg-gray-800/50 active:bg-gray-800 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs text-green-400 font-medium flex-shrink-0">To:</span>
                      <span className="text-sm font-semibold text-gray-300 truncate">
                        {msg.to}
                      </span>
                      {getPriorityIcon(msg.priority)}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${getPriorityColor(msg.priority)}`}>
                      {msg.priority}
                    </span>
                  </div>
                  <h3 className="text-sm mb-1 font-medium text-gray-300 truncate">
                    {msg.subject}
                  </h3>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-2">{msg.preview}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                    <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message Detail View */}
      {selectedMessage && (view === 'inbox' || view === 'sent') && (
        <div className="flex flex-col h-full">
          {/* Toolbar */}
          <div className="flex-shrink-0 px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
            <button
              onClick={() => setSelectedMessage(null)}
              className="text-blue-400 text-sm font-medium"
            >
              ← Back
            </button>
            <div className="relative">
              <button
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                className="p-2 text-gray-400 hover:bg-gray-700 rounded-md transition-colors flex items-center justify-center"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {showActionsMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10">
                  {view === 'inbox' && (
                    <>
                      <button
                        onClick={() => {
                          setComposeTo(selectedMessage.from)
                          setComposeSubject(`Re: ${selectedMessage.subject}`)
                          setComposeType('response')
                          setIsForwarding(false)
                          setForwardingOriginalMessage(null)
                          setShowActionsMenu(false)
                          setView('compose')
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors flex items-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        Reply
                      </button>
                      <button
                        onClick={() => prepareForward(selectedMessage)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors flex items-center gap-2"
                      >
                        <Forward className="w-4 h-4" />
                        Forward
                      </button>
                      <button
                        onClick={() => archiveMessage(selectedMessage.id)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors flex items-center gap-2"
                      >
                        <Archive className="w-4 h-4" />
                        Archive
                      </button>
                    </>
                  )}
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
                  {view === 'inbox' && (
                    <button
                      onClick={() => deleteMessage(selectedMessage.id)}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/30 transition-colors flex items-center gap-2 border-t border-gray-700"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Message Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4">
              {view === 'sent' && (
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-green-400 font-medium">Sent Message</span>
                </div>
              )}
              <h2 className="text-lg font-bold text-gray-100 mb-2">
                {selectedMessage.subject}
              </h2>
              <div className="flex flex-col gap-1 text-xs text-gray-400">
                <div>
                  <span className="font-medium">{view === 'inbox' ? 'From:' : 'To:'}</span>{' '}
                  <span>{view === 'inbox' ? selectedMessage.from : selectedMessage.to}</span>
                </div>
                <div>{new Date(selectedMessage.timestamp).toLocaleString()}</div>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(selectedMessage.priority)}`}>
                {selectedMessage.priority}
              </span>
              <span className="text-xs px-2 py-1 rounded bg-purple-900/30 text-purple-400">
                {selectedMessage.content.type}
              </span>
            </div>

            <div className="p-3 bg-gray-800 rounded-lg mb-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-200 font-sans">
                {selectedMessage.content.message}
              </pre>
            </div>

            {selectedMessage.content.context && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-gray-400 mb-2">Context:</h3>
                <pre className="p-3 bg-gray-800 rounded text-xs overflow-x-auto text-gray-300">
                  {JSON.stringify(selectedMessage.content.context, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compose View */}
      {view === 'compose' && (
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-lg font-bold text-gray-100 mb-4">
            {isForwarding ? 'Forward Message' : 'Compose Message'}
          </h2>

          {isForwarding && (
            <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded-md">
              <p className="text-xs text-blue-300">
                <Forward className="w-3 h-3 inline-block mr-1" />
                Forwarding from <strong>{forwardingOriginalMessage?.from}</strong>
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                To (Agent Name):
              </label>
              <input
                type="text"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                list="agents-list"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter agent ID or alias"
              />
              <datalist id="agents-list">
                {allAgents.filter(a => a.id !== agentId).map(agent => {
                  // Use qualified name format (agentId@hostId) for remote agents
                  const qualifiedId = agent.hostId && agent.hostId !== 'local'
                    ? `${agent.id}@${agent.hostId}`
                    : agent.id
                  return (
                    <option key={agent.id} value={qualifiedId} label={agent.alias} />
                  )
                })}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Subject:
              </label>
              <input
                type="text"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter subject"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Priority:
                </label>
                <select
                  value={composePriority}
                  onChange={(e) => setComposePriority(e.target.value as any)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Type:
                </label>
                <select
                  value={composeType}
                  onChange={(e) => setComposeType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="request">Request</option>
                  <option value="response">Response</option>
                  <option value="notification">Notification</option>
                  <option value="update">Update</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Message:
              </label>
              <textarea
                value={composeMessage}
                onChange={(e) => setComposeMessage(e.target.value)}
                rows={12}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="Enter your message..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={sendMessage}
                disabled={loading}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {loading ? (isForwarding ? 'Forwarding...' : 'Sending...') : (isForwarding ? 'Forward' : 'Send')}
              </button>
              <button
                onClick={() => {
                  setView('inbox')
                  setIsForwarding(false)
                  setForwardingOriginalMessage(null)
                }}
                className="px-6 py-2.5 bg-gray-700 text-gray-200 rounded-md hover:bg-gray-600 transition-colors text-sm font-medium"
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

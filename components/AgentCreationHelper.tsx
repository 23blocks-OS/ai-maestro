'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Check, Loader2, AlertCircle, Paperclip, FileText, Wand2, Upload } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as _SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import AgentConfigPanel, { type AgentConfigDraft, createEmptyDraft } from './AgentConfigPanel'

// react-syntax-highlighter type definitions lag behind React 18 (missing `refs` property).
// Double-cast via unknown to satisfy JSX element type constraints.
const SyntaxHighlighter = _SyntaxHighlighter as unknown as React.ComponentType<{
  style: Record<string, React.CSSProperties>
  language: string
  PreTag: string
  customStyle?: React.CSSProperties
  children: string
}>

// --- Types ---

interface ConfigItem {
  name: string
  description: string
}

export type { AgentConfigDraft }

interface ConfigSuggestion {
  action: 'set' | 'add' | 'remove'
  field: string
  value: string | ConfigItem
}

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  timestamp: number
}

// Session lifecycle states (component unmounts on close, no 'closed' state needed)
type SessionState = 'starting' | 'ready' | 'error'

// --- Constants ---

// Haephestos is a TEMPORARY, EPHEMERAL agent backed by a real Claude Code session
// running in tmux.  It is destroyed when this modal closes.
const HAEPHESTOS_AVATAR_THUMB = '/avatars/haephestos_thumb.png'

// Polling intervals (ms)
const STATUS_POLL_INTERVAL = 1000
const RESPONSE_POLL_INTERVAL = 800
const RESPONSE_TIMEOUT_MS = 60_000  // Max wait for Claude response before showing error
const STARTUP_TIMEOUT_MS = 30_000   // Max wait for Claude to become ready after launch

// Protocol whitelist for rendered markdown links
const SAFE_URL_PROTOCOL = /^(https?:\/\/|mailto:|#)/i

// --- Helpers ---

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** Strip null bytes, ASCII control chars (except newline/tab), and bidi-override chars. */
function sanitizeInput(text: string): string {
  return text
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
}

// --- Props ---

interface AgentCreationHelperProps {
  onClose: () => void
  onComplete: (config: AgentConfigDraft) => void
}

// --- Main Component ---

export default function AgentCreationHelper({ onClose, onComplete }: AgentCreationHelperProps) {
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [sessionState, setSessionState] = useState<SessionState>('starting')
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [waitingForResponse, setWaitingForResponse] = useState(false)
  const [config, setConfig] = useState<AgentConfigDraft>({
    ...createEmptyDraft(),
    program: 'claude-code',
    model: 'claude-sonnet-4-5',
    role: 'member',
  })
  const [agentDescPath, setAgentDescPath] = useState('')
  const [agentDescDisplay, setAgentDescDisplay] = useState('')
  const [designDocPath, setDesignDocPath] = useState('')
  const [designDocDisplay, setDesignDocDisplay] = useState('')
  const [existingProfilePath, setExistingProfilePath] = useState('')
  const [existingProfileDisplay, setExistingProfileDisplay] = useState('')
  const [showAttachments, setShowAttachments] = useState(false)
  const [isProfileGenerating, setIsProfileGenerating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Hidden file input refs for the 3 attachment fields
  const agentDescFileRef = useRef<HTMLInputElement>(null)
  const designDocFileRef = useRef<HTMLInputElement>(null)
  const existingProfileFileRef = useRef<HTMLInputElement>(null)

  // ----- Session lifecycle -----

  // Start session on mount, kill on unmount
  useEffect(() => {
    mountedRef.current = true
    startSession()

    return () => {
      mountedRef.current = false
      clearPolling()
      // Fire-and-forget cleanup — session kill doesn't need to block unmount
      fetch('/api/agents/creation-helper/session', { method: 'DELETE' }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    const timer = setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
    return () => clearTimeout(timer)
  }, [messages.length])

  // Focus input when session becomes ready or after response arrives
  useEffect(() => {
    if (sessionState === 'ready' && !waitingForResponse) {
      inputRef.current?.focus()
    }
  }, [sessionState, waitingForResponse])

  // Close modal on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  // ----- Helpers -----

  const clearPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
  }, [])

  // Apply config suggestions from Claude's structured output
  const applySuggestions = useCallback((suggestions: ConfigSuggestion[]) => {
    setConfig(prev => {
      const next = { ...prev }
      for (const s of suggestions) {
        if (s.action === 'set') {
          (next as Record<string, unknown>)[s.field] = s.value
        } else if (s.action === 'add') {
          const arr = next[s.field as keyof AgentConfigDraft]
          if (Array.isArray(arr)) {
            const item = s.value
            if (typeof item === 'string') {
              if (!(arr as unknown[]).includes(item)) {
                (next as Record<string, unknown>)[s.field] = [...arr, item]
              }
            } else {
              if (!(arr as ConfigItem[]).find(x => x.name === item.name)) {
                (next as Record<string, unknown>)[s.field] = [...arr, item]
              }
            }
          }
        } else if (s.action === 'remove') {
          const arr = next[s.field as keyof AgentConfigDraft]
          if (Array.isArray(arr)) {
            const name = typeof s.value === 'string' ? s.value : s.value.name
            ;(next as Record<string, unknown>)[s.field] = arr.filter((x: string | ConfigItem) =>
              typeof x === 'string' ? x !== name : x.name !== name
            )
          }
        }
      }
      return next
    })
  }, [])

  // ----- Session start -----

  const startSession = useCallback(async () => {
    try {
      setSessionState('starting')
      setSessionError(null)

      // Request session creation
      const res = await fetch('/api/agents/creation-helper/session', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed to start session (${res.status})`)
      }

      // Poll for readiness (Claude needs time to load)
      statusPollRef.current = setInterval(async () => {
        if (!mountedRef.current) return
        try {
          const statusRes = await fetch('/api/agents/creation-helper/session')
          if (!statusRes.ok) return
          const status = await statusRes.json()

          if (status.ready) {
            // Session ready — stop polling and timeout, capture initial greeting
            if (statusPollRef.current) {
              clearInterval(statusPollRef.current)
              statusPollRef.current = null
            }
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current)
              timeoutRef.current = null
            }
            if (!mountedRef.current) return
            setSessionState('ready')
            // Capture Claude's initial greeting
            captureInitialGreeting()
          }
        } catch {
          // Ignore transient polling errors
        }
      }, STATUS_POLL_INTERVAL)

      // Timeout: if Claude doesn't start within STARTUP_TIMEOUT_MS, show error
      timeoutRef.current = setTimeout(() => {
        if (statusPollRef.current) {
          clearInterval(statusPollRef.current)
          statusPollRef.current = null
        }
        if (!mountedRef.current) return
        setSessionState('error')
        setSessionError('Haephestos took too long to start. Please close and try again.')
      }, STARTUP_TIMEOUT_MS)
    } catch (error) {
      if (!mountedRef.current) return
      setSessionState('error')
      setSessionError(error instanceof Error ? error.message : 'Failed to start Haephestos')
    }
  }, [])

  // Capture the initial greeting that Claude produces on startup
  const captureInitialGreeting = useCallback(async () => {
    if (!mountedRef.current) return
    setWaitingForResponse(true)

    // Clear any existing poll before starting a new one (prevent interval leak)
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }

    // Timeout: show fallback if no greeting arrives within RESPONSE_TIMEOUT_MS
    timeoutRef.current = setTimeout(() => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      if (!mountedRef.current) return
      setWaitingForResponse(false)
      setMessages(prev => [...prev, {
        id: makeId(),
        role: 'assistant',
        text: 'Haephestos took too long to respond. Please try sending a message to get started.',
        timestamp: Date.now(),
      }])
    }, RESPONSE_TIMEOUT_MS)

    // Poll for the initial response
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) return
      try {
        const res = await fetch('/api/agents/creation-helper/response')
        if (!res.ok) return
        const data = await res.json()

        if (data.isComplete && data.text) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
          if (!mountedRef.current) return

          setWaitingForResponse(false)
          setMessages(prev => [...prev, {
            id: makeId(),
            role: 'assistant',
            text: data.text,
            timestamp: Date.now(),
          }])
          // Apply any config suggestions from greeting
          if (data.configSuggestions?.length) {
            applySuggestions(data.configSuggestions as ConfigSuggestion[])
          }
        }
      } catch {
        // Ignore transient errors
      }
    }, RESPONSE_POLL_INTERVAL)
  }, [applySuggestions])

  // ----- Message sending -----

  const sendUserMessage = useCallback(async (rawText: string) => {
    const userText = sanitizeInput(rawText)
    if (!userText.trim() || sessionState !== 'ready' || waitingForResponse) return

    // Add user message to UI
    setMessages(prev => [...prev, {
      id: makeId(),
      role: 'user',
      text: userText,
      timestamp: Date.now(),
    }])
    setWaitingForResponse(true)

    try {
      // Send to Claude via tmux
      const res = await fetch('/api/agents/creation-helper/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send message')
      }

      // Clear any existing poll before starting a new one (prevent interval leak)
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }

      // Timeout: show error if no response within RESPONSE_TIMEOUT_MS
      timeoutRef.current = setTimeout(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        if (!mountedRef.current) return
        setWaitingForResponse(false)
        setMessages(prev => [...prev, {
          id: makeId(),
          role: 'assistant',
          text: 'Haephestos took too long to respond. The session may have encountered an issue. Please try again.',
          timestamp: Date.now(),
        }])
      }, RESPONSE_TIMEOUT_MS)

      // Poll for Claude's response
      pollRef.current = setInterval(async () => {
        if (!mountedRef.current) return
        try {
          const respRes = await fetch('/api/agents/creation-helper/response')
          if (!respRes.ok) return
          const data = await respRes.json()

          if (data.isComplete && data.text) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
            if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
            if (!mountedRef.current) return

            setWaitingForResponse(false)
            setMessages(prev => [...prev, {
              id: makeId(),
              role: 'assistant',
              text: data.text,
              timestamp: Date.now(),
            }])
            // Apply config suggestions
            if (data.configSuggestions?.length) {
              applySuggestions(data.configSuggestions as ConfigSuggestion[])
            }
          }
        } catch {
          // Ignore transient polling errors
        }
      }, RESPONSE_POLL_INTERVAL)
    } catch (error) {
      if (!mountedRef.current) return
      setWaitingForResponse(false)
      setMessages(prev => [...prev, {
        id: makeId(),
        role: 'assistant',
        text: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        timestamp: Date.now(),
      }])
    }
  }, [sessionState, waitingForResponse, applySuggestions])

  // ----- UI handlers -----

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text) return
    setInputText('')
    sendUserMessage(text)
  }, [inputText, sendUserMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleRemove = useCallback((field: string, name: string) => {
    applySuggestions([{ action: 'remove', field, value: name }])
  }, [applySuggestions])

  const handleGenerateProfile = useCallback((mode: 'create' | 'edit' | 'align') => {
    if (sessionState !== 'ready' || waitingForResponse || isProfileGenerating) return
    // Validate required fields per mode
    if (mode === 'create' && !agentDescPath.trim()) return
    if (mode === 'edit' && !existingProfilePath.trim()) return
    if (mode === 'align' && (!existingProfilePath.trim() || !designDocPath.trim())) return

    setIsProfileGenerating(true)
    const parts = [`[PROFILE REQUEST] mode: ${mode}`]
    if (mode === 'create') {
      parts.push(`Agent description: ${agentDescPath.trim()}`)
    }
    if (existingProfilePath.trim() && (mode === 'edit' || mode === 'align')) {
      parts.push(`Existing profile: ${existingProfilePath.trim()}`)
    }
    if (designDocPath.trim()) {
      parts.push(`Design document: ${designDocPath.trim()}`)
    }
    sendUserMessage(parts.join(' | '))
    setTimeout(() => setIsProfileGenerating(false), 2000)
  }, [agentDescPath, designDocPath, existingProfilePath, sessionState, waitingForResponse, isProfileGenerating, sendUserMessage])

  // Upload a file to the server and store the server-side path
  const uploadFile = useCallback(async (
    file: File,
    pathSetter: (path: string) => void,
    displaySetter: (name: string) => void,
  ) => {
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/agents/creation-helper/file-picker', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.error('Upload failed:', data.error)
        return
      }
      const data = await res.json()
      if (data.path) {
        pathSetter(data.path)
        displaySetter(data.filename || file.name)
      }
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setIsUploading(false)
    }
  }, [])

  // File input change handlers
  const handleFileChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement>,
    pathSetter: (path: string) => void,
    displaySetter: (name: string) => void,
  ) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file, pathSetter, displaySetter)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }, [uploadFile])

  const canAccept = !!config.name

  // ----- Render -----

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-xl w-full max-w-5xl shadow-2xl border border-gray-700 overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh', height: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <img
              src={HAEPHESTOS_AVATAR_THUMB}
              alt="Haephestos"
              className="w-8 h-8 rounded-full object-cover ring-2 ring-amber-500/50"
            />
            <div>
              <h3 className="text-base font-semibold text-gray-100">Haephestos</h3>
              <span className="text-[10px] text-gray-500 leading-none">Agent Forge Master</span>
            </div>
            {sessionState === 'starting' && (
              <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
                <Loader2 className="w-3 h-3 animate-spin" />
                Starting...
              </span>
            )}
            {sessionState === 'ready' && waitingForResponse && (
              <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Thinking...
              </span>
            )}
            {sessionState === 'ready' && !waitingForResponse && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Online
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Chat + Config panel */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          {/* Left panel - Chat */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 md:border-r border-gray-800">
            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Starting state */}
              {sessionState === 'starting' && messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-400">Starting Haephestos...</p>
                    <p className="text-xs text-gray-600 mt-1">Loading the Agent Forge</p>
                  </div>
                </div>
              )}

              {/* Error state */}
              {sessionState === 'error' && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-sm">
                    <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                    <p className="text-sm text-red-300 font-medium">Failed to start Haephestos</p>
                    <p className="text-xs text-gray-500 mt-1">{sessionError}</p>
                    <button
                      onClick={startSession}
                      className="mt-3 px-4 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {/* Messages */}
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className={`flex ${msg.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex-shrink-0 mr-2 mt-1">
                        <img src={HAEPHESTOS_AVATAR_THUMB} alt="Haephestos" width={64} height={64} className="w-8 h-8 rounded-full object-cover ring-1 ring-amber-500/40" />
                      </div>
                    )}
                    <div className={msg.role === 'assistant' ? 'max-w-[90%]' : 'max-w-[85%]'}>
                      <div
                        className={`rounded-xl px-3.5 py-2.5 text-sm ${
                          msg.role === 'assistant'
                            ? 'bg-gray-800 text-gray-200 rounded-tl-sm'
                            : 'bg-blue-600 text-white rounded-tr-sm whitespace-pre-wrap'
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown
                            components={{
                              h1: ({ children }) => <h1 className="text-lg font-bold text-amber-300 mt-3 mb-1 first:mt-0">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-base font-semibold text-amber-300 mt-2.5 mb-1 first:mt-0">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-sm font-semibold text-amber-200 mt-2 mb-0.5 first:mt-0">{children}</h3>,
                              p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                              strong: ({ children }) => <strong className="font-semibold text-amber-300">{children}</strong>,
                              em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
                              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                              code: ({ className, children }) => {
                                const langMatch = /language-(\w+)/.exec(className || '')
                                if (langMatch) {
                                  return (
                                    <SyntaxHighlighter
                                      style={vscDarkPlus}
                                      language={langMatch[1]}
                                      PreTag="div"
                                      customStyle={{ margin: '0.5rem 0', borderRadius: '0.375rem', fontSize: '0.75rem' }}
                                    >
                                      {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                  )
                                }
                                return <code className="bg-gray-900/60 rounded px-1 py-0.5 text-xs font-mono text-amber-200">{children}</code>
                              },
                              pre: ({ children }) => <>{children}</>,
                              table: ({ children }) => (
                                <div className="overflow-x-auto my-2">
                                  <table className="w-full text-xs border-collapse">{children}</table>
                                </div>
                              ),
                              thead: ({ children }) => <thead className="bg-gray-900/60">{children}</thead>,
                              th: ({ children }) => <th className="border border-gray-700 px-2 py-1.5 text-left font-semibold text-amber-300">{children}</th>,
                              td: ({ children }) => <td className="border border-gray-700/50 px-2 py-1 text-gray-300">{children}</td>,
                              blockquote: ({ children }) => <blockquote className="border-l-2 border-amber-500/40 pl-3 my-2 text-gray-400 italic">{children}</blockquote>,
                              hr: () => <hr className="border-gray-700 my-3" />,
                              a: ({ href, children }) => {
                                const safeHref = href && SAFE_URL_PROTOCOL.test(href) ? href : undefined
                                return safeHref
                                  ? <a href={safeHref} className="text-amber-400 underline hover:text-amber-300" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a>
                                  : <span className="text-amber-400">{children}</span>
                              },
                              img: () => null,
                            }}
                          >
                            {msg.text}
                          </ReactMarkdown>
                        ) : (
                          msg.text
                        )}
                      </div>
                      <div className="text-[9px] text-gray-600 mt-0.5 px-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Thinking indicator */}
              {waitingForResponse && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="flex-shrink-0 mr-2 mt-1">
                    <img src={HAEPHESTOS_AVATAR_THUMB} alt="" width={64} height={64} className="w-8 h-8 rounded-full object-cover ring-1 ring-amber-500/40" />
                  </div>
                  <div className="bg-gray-800 rounded-xl rounded-tl-sm px-4 py-3">
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                  </div>
                </motion.div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div className="px-4 py-3 border-t border-gray-800">
              {/* Attachment panel */}
              <AnimatePresence>
                {showAttachments && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mb-2 space-y-1.5 bg-gray-800/40 rounded-lg p-2.5">
                      {/* Hidden file inputs */}
                      <input ref={agentDescFileRef} type="file" accept=".md,.txt" className="hidden"
                        onChange={e => handleFileChange(e, setAgentDescPath, setAgentDescDisplay)} />
                      <input ref={designDocFileRef} type="file" accept=".md,.txt" className="hidden"
                        onChange={e => handleFileChange(e, setDesignDocPath, setDesignDocDisplay)} />
                      <input ref={existingProfileFileRef} type="file" accept=".toml" className="hidden"
                        onChange={e => handleFileChange(e, setExistingProfilePath, setExistingProfileDisplay)} />

                      {/* Agent description */}
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <div className="flex-1 flex items-center gap-1.5 text-xs bg-gray-900/60 rounded px-2 py-1.5 min-h-[28px]">
                          {agentDescDisplay ? (
                            <span className="text-amber-200 truncate">{agentDescDisplay}</span>
                          ) : (
                            <span className="text-gray-500">Agent description (.md) — for new agents</span>
                          )}
                        </div>
                        <button
                          onClick={() => agentDescFileRef.current?.click()}
                          disabled={isUploading}
                          className="p-1.5 rounded hover:bg-gray-700 text-amber-400 hover:text-amber-300 transition-colors flex-shrink-0 disabled:opacity-40"
                          title="Upload agent description file"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                        {agentDescPath && (
                          <button
                            onClick={() => { setAgentDescPath(''); setAgentDescDisplay('') }}
                            className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Existing profile */}
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                        <div className="flex-1 flex items-center gap-1.5 text-xs bg-gray-900/60 rounded px-2 py-1.5 min-h-[28px]">
                          {existingProfileDisplay ? (
                            <span className="text-purple-200 truncate">{existingProfileDisplay}</span>
                          ) : (
                            <span className="text-gray-500">Existing profile (.agent.toml) — for editing/aligning</span>
                          )}
                        </div>
                        <button
                          onClick={() => existingProfileFileRef.current?.click()}
                          disabled={isUploading}
                          className="p-1.5 rounded hover:bg-gray-700 text-purple-400 hover:text-purple-300 transition-colors flex-shrink-0 disabled:opacity-40"
                          title="Upload existing .agent.toml profile"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                        {existingProfilePath && (
                          <button
                            onClick={() => { setExistingProfilePath(''); setExistingProfileDisplay('') }}
                            className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Design document */}
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        <div className="flex-1 flex items-center gap-1.5 text-xs bg-gray-900/60 rounded px-2 py-1.5 min-h-[28px]">
                          {designDocDisplay ? (
                            <span className="text-blue-200 truncate">{designDocDisplay}</span>
                          ) : (
                            <span className="text-gray-500">Design/requirements document (.md) — optional</span>
                          )}
                        </div>
                        <button
                          onClick={() => designDocFileRef.current?.click()}
                          disabled={isUploading}
                          className="p-1.5 rounded hover:bg-gray-700 text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0 disabled:opacity-40"
                          title="Upload design/requirements document"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                        {designDocPath && (
                          <button
                            onClick={() => { setDesignDocPath(''); setDesignDocDisplay('') }}
                            className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {agentDescPath.trim() && (
                          <button
                            onClick={() => handleGenerateProfile('create')}
                            disabled={sessionState !== 'ready' || waitingForResponse || isProfileGenerating}
                            className="flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Wand2 className="w-3 h-3" />
                            {isProfileGenerating ? 'Generating...' : 'New Profile'}
                          </button>
                        )}
                        {existingProfilePath.trim() && (
                          <button
                            onClick={() => handleGenerateProfile('edit')}
                            disabled={sessionState !== 'ready' || waitingForResponse || isProfileGenerating}
                            className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Wand2 className="w-3 h-3" />
                            {isProfileGenerating ? 'Updating...' : 'Edit Profile'}
                          </button>
                        )}
                        {existingProfilePath.trim() && designDocPath.trim() && (
                          <button
                            onClick={() => handleGenerateProfile('align')}
                            disabled={sessionState !== 'ready' || waitingForResponse || isProfileGenerating}
                            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Wand2 className="w-3 h-3" />
                            {isProfileGenerating ? 'Aligning...' : 'Align to Design'}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Attached file chips */}
              {!showAttachments && (agentDescDisplay || designDocDisplay || existingProfileDisplay) && (
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  {agentDescDisplay && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-300 rounded px-1.5 py-0.5">
                      <FileText className="w-2.5 h-2.5" />
                      {agentDescDisplay}
                      <button onClick={() => { setAgentDescPath(''); setAgentDescDisplay('') }} className="hover:text-amber-100">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )}
                  {existingProfileDisplay && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-purple-500/10 text-purple-300 rounded px-1.5 py-0.5">
                      <FileText className="w-2.5 h-2.5" />
                      {existingProfileDisplay}
                      <button onClick={() => { setExistingProfilePath(''); setExistingProfileDisplay('') }} className="hover:text-purple-100">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )}
                  {designDocDisplay && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-300 rounded px-1.5 py-0.5">
                      <FileText className="w-2.5 h-2.5" />
                      {designDocDisplay}
                      <button onClick={() => { setDesignDocPath(''); setDesignDocDisplay('') }} className="hover:text-blue-100">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-end gap-2">
                <button
                  onClick={() => setShowAttachments(prev => !prev)}
                  className={`p-2.5 rounded-lg transition-colors flex-shrink-0 ${
                    showAttachments ? 'bg-amber-600/20 text-amber-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                  }`}
                  title="Attach agent description & design document for PSS profiling"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    sessionState === 'starting' ? 'Waiting for Haephestos...'
                    : sessionState === 'error' ? 'Session failed — click Retry above'
                    : waitingForResponse ? 'Haephestos is thinking...'
                    : 'Tell Haephestos what kind of agent you need...'
                  }
                  disabled={sessionState !== 'ready' || waitingForResponse}
                  rows={1}
                  className="flex-1 text-sm bg-gray-800/50 text-gray-200 placeholder-gray-500 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50 max-h-20 disabled:opacity-40"
                  style={{ minHeight: '40px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || sessionState !== 'ready' || waitingForResponse}
                  className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right panel - Config */}
          <AgentConfigPanel
            config={config}
            isBuilding={sessionState === 'starting' || waitingForResponse}
            onRemove={handleRemove}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-800">
          <span className="text-xs text-gray-500">
            {sessionState === 'starting' ? 'Loading Haephestos...'
            : sessionState === 'error' ? 'Session error'
            : sessionState === 'ready' && waitingForResponse ? 'Haephestos is responding...'
            : messages.length === 0 ? 'Ready'
            : `${messages.length} messages`}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (canAccept) onComplete(config)
              }}
              disabled={!canAccept}
              className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-lg shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:scale-100 text-sm flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Create Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

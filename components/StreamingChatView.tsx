'use client'

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react'
import { User, Bot, Wrench, Loader2, Send, Zap, AlertCircle } from 'lucide-react'
import { MarkdownContent } from '@/components/chat/MarkdownRenderer'
import type { Agent } from '@/types/agent'

/**
 * EXPERIMENTAL streaming-chat PoC. Drives Claude Code in stream-json mode
 * (NOT tmux) via the /stream-chat WebSocket. One persistent claude process
 * per connection. No terminal — this is the "chat that actually works" spike.
 */

interface StreamingChatViewProps {
  agent: Agent
  isActive?: boolean
}

interface Turn {
  id: string
  role: 'user' | 'assistant'
  text: string
  tools: Array<{ name: string; input: any }>
  done?: boolean
}

interface Meta {
  model?: string
  sessionId?: string
  cost?: number
  turns?: number
}

let idCounter = 0
const nextId = () => `t${++idCounter}`

export default function StreamingChatView({ agent, isActive = false }: StreamingChatViewProps) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noToken, setNoToken] = useState(false)
  const [meta, setMeta] = useState<Meta>({})

  const wsRef = useRef<WebSocket | null>(null)
  const curAssistantId = useRef<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' })

  // Ensure a current assistant turn exists to append streaming text/tools into
  const ensureAssistant = useCallback(() => {
    if (curAssistantId.current) return curAssistantId.current
    const id = nextId()
    curAssistantId.current = id
    setTurns(prev => [...prev, { id, role: 'assistant', text: '', tools: [] }])
    return id
  }, [])

  const appendText = useCallback((delta: string) => {
    const id = ensureAssistant()
    setTurns(prev => prev.map(t => t.id === id ? { ...t, text: t.text + delta } : t))
  }, [ensureAssistant])

  const addTool = useCallback((name: string, toolInput: any) => {
    const id = ensureAssistant()
    setTurns(prev => prev.map(t =>
      t.id === id ? { ...t, tools: [...t.tools, { name, input: toolInput }] } : t
    ))
  }, [ensureAssistant])

  useEffect(() => {
    if (!isActive || !agent?.id) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const sessionName = agent.name || agent.alias || agent.id
    const url = `${protocol}//${window.location.host}/stream-chat?agentId=${encodeURIComponent(agent.id)}&name=${encodeURIComponent(sessionName)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setError(null)

    ws.onmessage = (e) => {
      let msg: any
      try { msg = JSON.parse(e.data) } catch { return }

      switch (msg.type) {
        case 'stream:ready':
          // Fresh connect OR reconnect to a live session: reset and rebuild
          // purely from the server's replayed buffer (single source of truth).
          setConnected(true)
          setNoToken(msg.hasToken === false)
          setTurns([])
          curAssistantId.current = null
          setThinking(false)
          setError(null)
          setMeta({})
          break
        case 'stream:replay-done':
          break
        case 'stream:user': {
          // A user turn (this client's or another's) — rebuild it. Server
          // echoes every send here so live + replay share one code path.
          curAssistantId.current = null
          setTurns(prev => [...prev, { id: nextId(), role: 'user', text: msg.text || '', tools: [], done: true }])
          setThinking(true)
          break
        }
        case 'stream:error':
          setError(msg.error || 'Stream error')
          setThinking(false)
          break
        case 'stream:exit':
          setConnected(false)
          setThinking(false)
          setError(`Claude process exited (code ${msg.code ?? '?'})`)
          break
        case 'stream:event': {
          const ev = msg.event
          if (!ev || !ev.type) break

          if (ev.type === 'system' && ev.subtype === 'init') {
            setMeta(m => ({ ...m, model: ev.model, sessionId: ev.session_id }))
          } else if (ev.type === 'stream_event') {
            // token-by-token text deltas (--include-partial-messages)
            const inner = ev.event
            if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
              appendText(inner.delta.text || '')
            }
          } else if (ev.type === 'assistant') {
            // full assistant message — authoritative. Set text from its text
            // blocks (covers responses that arrive with NO deltas, e.g. the
            // "Not logged in" error), and add tool_use cards.
            const content = ev.message?.content
            if (Array.isArray(content)) {
              const text = content.filter((b: any) => b.type === 'text' && b.text).map((b: any) => b.text).join('')
              if (text) {
                const id = ensureAssistant()
                setTurns(prev => prev.map(t => t.id === id ? { ...t, text } : t))
              }
              for (const block of content) {
                if (block.type === 'tool_use') addTool(block.name || 'tool', block.input)
              }
            }
          } else if (ev.type === 'result') {
            // turn complete
            const id = curAssistantId.current
            if (id) setTurns(prev => prev.map(t => t.id === id ? { ...t, done: true } : t))
            curAssistantId.current = null
            setThinking(false)
            setMeta(m => ({
              ...m,
              cost: (m.cost || 0) + (ev.total_cost_usd || 0),
              turns: (m.turns || 0) + 1,
            }))
          }
          break
        }
      }
    }

    ws.onclose = () => { setConnected(false); setThinking(false) }
    ws.onerror = () => setError('WebSocket error')

    return () => { ws.close(); wsRef.current = null }
  }, [agent.id, agent.name, agent.alias, isActive, appendText, addTool])

  useEffect(() => { scrollToBottom() }, [turns])

  const send = () => {
    const text = input.trim()
    if (!text || !connected || thinking) return
    if (wsRef.current?.readyState !== WebSocket.OPEN) { setError('Not connected'); return }
    // No optimistic add — the server echoes a stream:user event that renders
    // the turn, so live and replay-on-reconnect share one path (no duplicates).
    wsRef.current.send(JSON.stringify({ type: 'send', text }))
    setInput('')
    setThinking(true)
    setError(null)
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            !connected ? 'bg-red-500' : thinking ? 'bg-amber-400 animate-pulse' : 'bg-green-500'
          }`} />
          <div>
            <h3 className="text-sm font-medium text-gray-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              {!connected ? 'Connecting…' : thinking ? 'Streaming…' : (agent.label || agent.name || 'Streaming chat')}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              stream-json (no tmux){meta.model ? ` · ${meta.model}` : ''}
              {meta.turns ? ` · ${meta.turns} turns` : ''}
              {meta.cost ? ` · $${meta.cost.toFixed(4)}` : ''}
            </p>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-amber-400/70 border border-amber-400/30 rounded px-1.5 py-0.5">PoC</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4" style={{ minHeight: 0 }}>
        {noToken && (
          <div className="px-4 py-3 bg-amber-900/20 border border-amber-800 rounded-lg text-xs text-amber-300">
            <p className="font-medium mb-1">⚠️ No headless auth token found</p>
            <p className="text-amber-300/80">This server can’t use your Keychain login. Run <code className="bg-gray-950/50 px-1 rounded font-mono">claude setup-token</code> in a terminal, then save the token to <code className="bg-gray-950/50 px-1 rounded font-mono">~/.aimaestro/claude-oauth-token</code> and restart. Until then the agent will reply “Not logged in”.</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        {turns.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Zap className="w-14 h-14 mb-3 opacity-30 text-amber-400" />
            <p className="text-base text-gray-400">Streaming chat (experimental)</p>
            <p className="text-xs mt-1">Runs Claude directly — no terminal, no tmux. Type to start.</p>
          </div>
        )}

        {turns.map(turn => {
          const isUser = turn.role === 'user'
          return (
            <div key={turn.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%] min-w-0 overflow-hidden">
                <div className={`rounded-2xl px-4 py-3 ${isUser ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                    <span className="text-xs opacity-70">{isUser ? 'You' : (agent.label || agent.name || 'Agent')}</span>
                    {!isUser && !turn.done && <Loader2 className="w-3 h-3 animate-spin opacity-60" />}
                  </div>

                  {turn.text && (
                    isUser
                      ? <div className="text-sm whitespace-pre-wrap break-words">{turn.text}</div>
                      : <MarkdownContent text={turn.text} />
                  )}

                  {turn.tools.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {turn.tools.map((tool, i) => (
                        <div key={i} className="flex items-center gap-2 bg-orange-900/30 border border-orange-800/50 rounded-lg px-3 py-1.5">
                          <Wrench className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                          <span className="text-xs text-orange-300 font-medium">{tool.name}</span>
                          <span className="text-xs text-orange-400/60 font-mono truncate">
                            {tool.input?.command || tool.input?.file_path || tool.input?.pattern || tool.input?.path || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 bg-gray-800 p-4 flex-shrink-0">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
            }}
            onKeyDown={onKeyDown}
            placeholder={connected ? 'Message the agent (stream-json)… Enter to send' : 'Connecting…'}
            className="flex-1 bg-gray-900 text-gray-200 text-sm rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 border border-gray-700 disabled:opacity-50"
            rows={1}
            style={{ maxHeight: '160px' }}
            disabled={!connected || thinking}
          />
          <button
            onClick={send}
            disabled={!connected || thinking || !input.trim()}
            className="px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {thinking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Experimental · runs on your subscription · acceptEdits mode (auto-approves edits)
        </div>
      </div>
    </div>
  )
}

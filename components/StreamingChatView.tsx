'use client'

import AgentHeaderBar from './AgentHeaderBar'
import { agentWorkingDirectory, getAgentBaseUrl } from '@/lib/agent-utils'
import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react'
import { User, Bot, Wrench, Loader2, Send, Zap, AlertCircle, ShieldAlert } from 'lucide-react'
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

interface PermReq {
  requestId: string
  toolName: string
  input: any
}

interface AskQuestion {
  question: string
  header?: string
  options?: Array<{ label: string; description?: string }>
  multiSelect?: boolean
}

interface QuestionReq {
  requestId: string
  questions: AskQuestion[]
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
  const [permissions, setPermissions] = useState<PermReq[]>([])

  // Questions are NOT permissions. A permission wants allow/deny; a question
  // wants the user's choices echoed back. They arrive through the same SDK
  // callback, which is why they used to render as an Allow/Deny card that gave
  // Claude no answer at all.
  const [questions, setQuestions] = useState<QuestionReq[]>([])
  const [picks, setPicks] = useState<Record<string, Record<string, string>>>({})
  const [freeText, setFreeText] = useState<Record<string, string>>({})

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
          setPermissions([])
          break
        case 'stream:replay-done':
          break
        case 'stream:permission':
          // Claude wants to use a tool that needs approval → show a card
          setPermissions(prev =>
            prev.some(p => p.requestId === msg.requestId)
              ? prev
              : [...prev, { requestId: msg.requestId, toolName: msg.toolName, input: msg.input }]
          )
          break
        case 'stream:question':
          setQuestions(prev =>
            prev.some(q => q.requestId === msg.requestId)
              ? prev
              : [...prev, { requestId: msg.requestId, questions: msg.questions || [] }]
          )
          break
        case 'stream:question-resolved':
          setQuestions(prev => prev.filter(q => q.requestId !== msg.requestId))
          break
        case 'stream:permission-resolved':
          setPermissions(prev => prev.filter(p => p.requestId !== msg.requestId))
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

  useEffect(() => { scrollToBottom() }, [turns, permissions])

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

  /**
   * Send answers back. Keys are the question TEXT, values the chosen label — or
   * the user's own words, which the SDK treats as a first-class answer rather
   * than a fallback. `freeform` covers "none of these, let me just tell you";
   * Claude receives it as "The user responded: …".
   */
  const respondQuestion = (requestId: string) => {
    const chosen = picks[requestId] || {}
    const typed = (freeText[requestId] || '').trim()
    const merged: Record<string, string> = { ...chosen }

    const qs = questions.find(q => q.requestId === requestId)?.questions || []
    if (typed && qs.length === 1) merged[qs[0].question] = typed

    wsRef.current?.send(JSON.stringify({
      type: 'questionAnswer',
      requestId,
      answers: merged,
      freeform: typed && qs.length !== 1 ? typed : null,
    }))
    setQuestions(prev => prev.filter(q => q.requestId !== requestId))
    setPicks(prev => { const n = { ...prev }; delete n[requestId]; return n })
    setFreeText(prev => { const n = { ...prev }; delete n[requestId]; return n })
  }

  const respondPermission = (requestId: string, decision: 'allow' | 'deny') => {
    wsRef.current?.send(JSON.stringify({ type: 'permissionDecision', requestId, decision }))
    setPermissions(prev => prev.filter(p => p.requestId !== requestId))  // optimistic
  }

  // One-line preview of what a tool wants to do
  const permPreview = (p: PermReq): string => {
    const i = p.input || {}
    return i.command || i.file_path || i.path || i.pattern || i.url || (Object.keys(i).length ? JSON.stringify(i).slice(0, 120) : '')
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-900">
      {/* Header: which agent, where, what it is doing (shared with the terminal and chat tabs) */}
      <AgentHeaderBar
        hostId={agent.hostId}
        remote={getAgentBaseUrl(agent) !== ''}
        name={agent.label || agent.name || agent.alias || 'Agent'}
        workingDirectory={agentWorkingDirectory(agent)}
        presence={!connected ? 'offline' : thinking ? 'working' : 'ready'}
        avatar={{ agentId: agent.id, src: agent.avatar, hostUrl: getAgentBaseUrl(agent), state: !connected ? 'sleeping' : thinking ? 'working' : 'idle' }}
        status={!connected ? 'Connecting…' : thinking ? 'Working…' : undefined}
        actions={
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-400/70 border border-amber-400/30 rounded px-1.5 py-0.5" title="Streaming mode is experimental">
            <Zap className="w-3 h-3" /> PoC
          </span>
        }
      />

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

        {/* Permission cards — Claude wants to do something that needs approval */}
        {questions.map((q) => (
          <div key={q.requestId} className="flex justify-start">
            <div className="max-w-[85%] min-w-0 overflow-hidden w-full">
              <div className="rounded-2xl px-4 py-3 bg-cyan-900/30 border border-cyan-700/50 text-cyan-100">
                {q.questions.map((question, qi) => (
                  <div key={qi} className="mb-3 last:mb-0">
                    {question.header && (
                      <div className="text-xs font-medium text-cyan-400 mb-1">{question.header}</div>
                    )}
                    <div className="text-sm mb-2">{question.question}</div>
                    <div className="space-y-1.5">
                      {(question.options || []).map((opt, oi) => {
                        const chosen = picks[q.requestId]?.[question.question] === opt.label
                        return (
                          <button
                            key={oi}
                            onClick={() => setPicks(prev => ({
                              ...prev,
                              [q.requestId]: { ...(prev[q.requestId] || {}), [question.question]: opt.label },
                            }))}
                            className={`flex items-start gap-2 w-full text-left px-3 py-2 rounded-lg border transition-all ${
                              chosen
                                ? 'bg-cyan-600/40 border-cyan-400/60'
                                : 'bg-cyan-800/20 border-cyan-600/30 hover:bg-cyan-700/30'
                            }`}
                          >
                            <span className="text-cyan-400 font-bold w-5 text-center flex-shrink-0">{oi + 1}</span>
                            <div className="min-w-0 flex-1">
                              <span className="text-sm text-cyan-200">{opt.label}</span>
                              {opt.description && (
                                <p className="text-xs text-cyan-400/60 mt-0.5">{opt.description}</p>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {/* Free text is an answer, not an escape hatch. */}
                <textarea
                  value={freeText[q.requestId] || ''}
                  onChange={(e) => setFreeText(prev => ({ ...prev, [q.requestId]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); respondQuestion(q.requestId) }
                  }}
                  placeholder="…or answer in your own words"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg bg-gray-950/40 border border-cyan-700/40 px-3 py-2 text-sm text-cyan-100 placeholder-cyan-500/50 focus:outline-none focus:border-cyan-500/70"
                />

                <button
                  onClick={() => respondQuestion(q.requestId)}
                  disabled={!picks[q.requestId] && !(freeText[q.requestId] || '').trim()}
                  className="mt-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-700/60 hover:bg-cyan-600/60 border border-cyan-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Answer
                </button>
              </div>
            </div>
          </div>
        ))}

        {permissions.map((p) => (
          <div key={p.requestId} className="flex justify-start">
            <div className="max-w-[85%] min-w-0 overflow-hidden">
              <div className="rounded-2xl px-4 py-3 bg-amber-900/40 border border-amber-600/50 text-amber-100">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-amber-300">
                    Allow <span className="font-mono">{p.toolName}</span>?
                  </span>
                </div>
                {permPreview(p) && (
                  <pre className="text-xs bg-gray-950/50 p-2 rounded font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto mb-3">
                    {permPreview(p)}
                  </pre>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => respondPermission(p.requestId, 'allow')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-700/60 hover:bg-amber-600/60 border border-amber-500/50 transition-colors"
                  >
                    Allow
                  </button>
                  <button
                    onClick={() => respondPermission(p.requestId, 'deny')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800/60 hover:bg-gray-700/60 border border-gray-600/50 transition-colors"
                  >
                    Deny
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

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

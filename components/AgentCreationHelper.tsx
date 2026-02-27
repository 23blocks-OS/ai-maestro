'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Check, ArrowLeft, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import AgentConfigPanel, { type AgentConfigDraft, createEmptyDraft } from './AgentConfigPanel'

// --- Types ---

export interface ConfigItem {
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

type ConversationStep = 'greeting' | 'purpose' | 'name' | 'skills' | 'plugins' | 'mcp' | 'rules' | 'review' | 'done'

// --- Constants ---

// Haephestos is a TEMPORARY, EPHEMERAL UI-only helper.  It is never registered
// in the agent registry, never assigned to a team, never receives or sends AMP
// messages, and is destroyed when this modal closes.  Its only communication
// channel is this chat panel with the human user.

// Full-size avatar (1024x1024 PNG with alpha) — shown in the modal header
const HAEPHESTOS_AVATAR_FULL = '/avatars/haephestos.png'
// Retina-ready thumbnail (256x256 PNG with alpha) — rendered at 32px (64px @2x)
const HAEPHESTOS_AVATAR_THUMB = '/avatars/haephestos_thumb.png'

const INITIAL_CONFIG: AgentConfigDraft = {
  ...createEmptyDraft(),
  program: 'claude-code',
  model: 'claude-sonnet-4-5',
  role: 'member',
}

// --- Keyword-based suggestion profiles ---

interface SuggestionProfile {
  label: string
  skills: ConfigItem[]
  plugins: ConfigItem[]
  mcpServers: ConfigItem[]
  rules: string[]
  tags: string[]
}

const PROFILES: Record<string, SuggestionProfile> = {
  development: {
    label: 'Development',
    skills: [
      { name: 'tdd', description: 'Test-driven development workflow' },
      { name: 'git-workflow', description: 'Git branching and commit workflow' },
      { name: 'github-workflow', description: 'GitHub issues, PRs, and CI/CD' },
      { name: 'agent-messaging', description: 'AMP inter-agent messaging' },
      { name: 'planning', description: 'Task planning with persistent files' },
    ],
    plugins: [],
    mcpServers: [],
    rules: ['Write tests before implementation', 'Use feature branches for all changes'],
    tags: ['development', 'coding'],
  },
  research: {
    label: 'Research',
    skills: [
      { name: 'research-agent', description: 'External documentation and API research' },
      { name: 'planning', description: 'Task planning with persistent files' },
      { name: 'memory-search', description: 'Search conversation history' },
      { name: 'agent-messaging', description: 'AMP inter-agent messaging' },
    ],
    plugins: [],
    mcpServers: [{ name: 'filesystem', description: 'Local file system access' }],
    rules: ['Always cite sources', 'Verify claims before asserting'],
    tags: ['research', 'analysis'],
  },
  operations: {
    label: 'Operations',
    skills: [
      { name: 'ai-maestro-agents-management', description: 'Agent lifecycle management' },
      { name: 'team-governance', description: 'Team management and governance' },
      { name: 'planning', description: 'Task planning with persistent files' },
      { name: 'agent-messaging', description: 'AMP inter-agent messaging' },
    ],
    plugins: [],
    mcpServers: [],
    rules: ['Check agent health before operations', 'Log all operational changes'],
    tags: ['operations', 'management'],
  },
  documentation: {
    label: 'Documentation',
    skills: [
      { name: 'planning', description: 'Task planning with persistent files' },
      { name: 'create-handoff', description: 'Create handoff documents' },
      { name: 'agent-messaging', description: 'AMP inter-agent messaging' },
    ],
    plugins: [],
    mcpServers: [{ name: 'filesystem', description: 'Local file system access' }],
    rules: ['Keep documentation concise and actionable'],
    tags: ['documentation', 'writing'],
  },
  data: {
    label: 'Data Science',
    skills: [
      { name: 'planning', description: 'Task planning with persistent files' },
      { name: 'agent-messaging', description: 'AMP inter-agent messaging' },
    ],
    plugins: [],
    mcpServers: [{ name: 'filesystem', description: 'Local file system access' }],
    rules: ['Validate data before processing', 'Document all transformations'],
    tags: ['data-science', 'analysis'],
  },
  general: {
    label: 'General Purpose',
    skills: [
      { name: 'planning', description: 'Task planning with persistent files' },
      { name: 'agent-messaging', description: 'AMP inter-agent messaging' },
    ],
    plugins: [],
    mcpServers: [],
    rules: [],
    tags: ['general'],
  },
}

function detectProfile(text: string): string {
  const lower = text.toLowerCase()
  if (/\b(code|develop|build|implement|fix|bug|feature|program|software)\b/.test(lower)) return 'development'
  if (/\b(research|search|analyze|explor|investigat|study)\b/.test(lower)) return 'research'
  if (/\b(deploy|monitor|manage|ops|infra|devops|orchestrat)\b/.test(lower)) return 'operations'
  if (/\b(writ|document|content|blog|article|report)\b/.test(lower)) return 'documentation'
  if (/\b(data|ml|machine.?learn|visualiz|analy|statistic|model)\b/.test(lower)) return 'data'
  return 'general'
}

let msgIdCounter = 0
function makeId(): string {
  return `heph-${++msgIdCounter}-${Math.random().toString(36).slice(2, 6)}`
}

// --- Props ---

interface AgentCreationHelperProps {
  onClose: () => void
  onComplete: (config: AgentConfigDraft) => void
}

// --- Component ---

export default function AgentCreationHelper({ onClose, onComplete }: AgentCreationHelperProps) {
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [step, setStep] = useState<ConversationStep>('greeting')
  const [config, setConfig] = useState<AgentConfigDraft>({ ...INITIAL_CONFIG })
  const [detectedProfile, setDetectedProfile] = useState<string>('')

  // Initialize greeting
  useEffect(() => {
    const timer = setTimeout(() => {
      setMessages([{
        id: makeId(),
        role: 'assistant',
        text: "Welcome to the Agent Forge! I'm Haephestos, and I'll help you craft a new agent. What kind of agent do you need? Tell me about its purpose — for example: \"a development agent for building a React app\" or \"a research agent for analyzing scientific papers\".",
        timestamp: Date.now(),
      }])
      setStep('purpose')
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    const timer = setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
    return () => clearTimeout(timer)
  }, [messages.length])

  // Focus input when step changes
  useEffect(() => {
    inputRef.current?.focus()
  }, [step])

  // Apply suggestions to config
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
              if (!(arr as unknown[]).includes(item)) (arr as string[]).push(item)
            } else {
              if (!(arr as ConfigItem[]).find(x => x.name === item.name)) {
                (arr as ConfigItem[]).push(item)
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

  // Add assistant message with delay
  const addAssistantMessage = useCallback((text: string, delay = 600) => {
    return new Promise<void>(resolve => {
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: makeId(),
          role: 'assistant',
          text,
          timestamp: Date.now(),
        }])
        resolve()
      }, delay)
    })
  }, [])

  // Handle conversation flow
  const processMessage = useCallback(async (userText: string) => {
    // Add user message immediately
    setMessages(prev => [...prev, {
      id: makeId(),
      role: 'user',
      text: userText,
      timestamp: Date.now(),
    }])

    setSending(true)

    switch (step) {
      case 'purpose': {
        const profile = detectProfile(userText)
        setDetectedProfile(profile)
        const p = PROFILES[profile]

        // Apply profile suggestions
        const suggestions: ConfigSuggestion[] = [
          ...p.skills.map(s => ({ action: 'add' as const, field: 'skills', value: s })),
          ...p.plugins.map(s => ({ action: 'add' as const, field: 'plugins', value: s })),
          ...p.mcpServers.map(s => ({ action: 'add' as const, field: 'mcpServers', value: s })),
          ...p.rules.map(r => ({ action: 'add' as const, field: 'rules', value: r })),
          ...p.tags.map(t => ({ action: 'add' as const, field: 'tags', value: t })),
        ]
        applySuggestions(suggestions)

        await addAssistantMessage(
          `Sounds like a ${p.label.toLowerCase()} agent! I've loaded a ${p.label} profile with ${p.skills.length} skills` +
          (p.rules.length ? ` and ${p.rules.length} rules` : '') +
          `. You can see the configuration building on the right panel.\n\nNow, what should we name this agent? Use lowercase letters, numbers, dashes, and underscores (e.g., "my-api-builder").`
        )
        setStep('name')
        break
      }

      case 'name': {
        const trimmed = userText.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
        if (!trimmed) {
          await addAssistantMessage('That name doesn\'t look right. Use letters, numbers, dashes, and underscores. Try again!')
          break
        }
        applySuggestions([{ action: 'set', field: 'name', value: trimmed }])
        await addAssistantMessage(
          `"${trimmed}" — nice name! Take a look at the skills I've suggested in the right panel. ` +
          `Want to add more skills, remove any, or are these good? You can say things like:\n` +
          `• "add the security skill"\n` +
          `• "remove tdd"\n` +
          `• "these look good"\n` +
          `• "what other skills are available?"`
        )
        setStep('skills')
        break
      }

      case 'skills': {
        const lower = userText.toLowerCase()
        if (/\b(good|fine|ok|great|perfect|done|next|continue|skip)\b/.test(lower)) {
          await addAssistantMessage(
            'Skills are set! Do you need any MCP servers for external data access? ' +
            'For example:\n' +
            '• "filesystem" for local file access\n' +
            '• "postgres" for database access\n' +
            '• "github" for GitHub API\n\n' +
            'Or say "skip" to move on.'
          )
          setStep('mcp')
        } else if (/\b(add|include|want)\b/.test(lower)) {
          // Try to extract skill name
          const match = lower.match(/(?:add|include|want)\s+(?:the\s+)?["']?([a-z0-9_-]+)["']?/)
          if (match) {
            const skillName = match[1]
            applySuggestions([{ action: 'add', field: 'skills', value: { name: skillName, description: 'User-requested skill' } }])
            await addAssistantMessage(`Added "${skillName}" to your skills. Anything else, or are we good?`)
          } else {
            await addAssistantMessage('Which skill would you like to add? Give me the name.')
          }
        } else if (/\b(remove|drop|delete)\b/.test(lower)) {
          const match = lower.match(/(?:remove|drop|delete)\s+(?:the\s+)?["']?([a-z0-9_-]+)["']?/)
          if (match) {
            applySuggestions([{ action: 'remove', field: 'skills', value: match[1] }])
            await addAssistantMessage(`Removed "${match[1]}". Anything else?`)
          } else {
            await addAssistantMessage('Which skill should I remove?')
          }
        } else if (/\b(what|list|available|show)\b/.test(lower)) {
          await addAssistantMessage(
            'Here are some popular skills:\n' +
            '• **tdd** — Test-driven development\n' +
            '• **git-workflow** — Git branching and commits\n' +
            '• **github-workflow** — GitHub issues and PRs\n' +
            '• **security** — Security vulnerability scanning\n' +
            '• **research-agent** — External research\n' +
            '• **planning** — Persistent task planning\n' +
            '• **memory-search** — Search past conversations\n' +
            '• **docs-search** — Search documentation\n' +
            '• **agent-messaging** — Inter-agent messaging\n' +
            '• **team-governance** — Team management\n\n' +
            'Which would you like to add?'
          )
        } else {
          // Try to interpret as a skill name
          const words = lower.split(/\s+/).filter(w => w.length > 2)
          if (words.length === 1 || (words.length === 2 && words.join('-').length < 30)) {
            const skillName = words.join('-')
            applySuggestions([{ action: 'add', field: 'skills', value: { name: skillName, description: 'User-requested skill' } }])
            await addAssistantMessage(`Added "${skillName}". Want to add more, or move on?`)
          } else {
            await addAssistantMessage('I didn\'t quite catch that. Try "add [skill-name]", "remove [skill-name]", or "done" to continue.')
          }
        }
        break
      }

      case 'mcp': {
        const lower = userText.toLowerCase()
        if (/\b(skip|none|no|done|next|continue)\b/.test(lower)) {
          await addAssistantMessage(
            'Almost done! Any custom rules you want this agent to follow? ' +
            'For example:\n' +
            '• "Always write tests"\n' +
            '• "Never commit directly to main"\n' +
            '• "Use TypeScript strict mode"\n\n' +
            'Or say "skip" to finalize with the current rules.'
          )
          setStep('rules')
        } else if (/\b(add|include|want|yes)\b/.test(lower) || /\b(filesystem|postgres|github|sqlite|redis)\b/.test(lower)) {
          const mcpMatch = lower.match(/\b(filesystem|postgres|github|sqlite|redis|mongodb|docker)\b/)
          if (mcpMatch) {
            const mcpName = mcpMatch[1]
            const descriptions: Record<string, string> = {
              filesystem: 'Local file system access',
              postgres: 'PostgreSQL database access',
              github: 'GitHub API integration',
              sqlite: 'SQLite database access',
              redis: 'Redis cache/store access',
              mongodb: 'MongoDB database access',
              docker: 'Docker container management',
            }
            applySuggestions([{ action: 'add', field: 'mcpServers', value: { name: mcpName, description: descriptions[mcpName] || 'MCP server' } }])
            await addAssistantMessage(`Added "${mcpName}" MCP server. Any others, or say "done"?`)
          } else {
            await addAssistantMessage('Which MCP server? Available: filesystem, postgres, github, sqlite, redis, mongodb, docker.')
          }
        } else {
          await addAssistantMessage('Available MCP servers: filesystem, postgres, github, sqlite, redis, mongodb, docker. Which do you need?')
        }
        break
      }

      case 'rules': {
        const lower = userText.toLowerCase()
        if (/\b(skip|none|no|done|next|continue|finalize)\b/.test(lower)) {
          setStep('review')
          await addAssistantMessage(
            'Your agent is ready for review! Check the configuration on the right panel. ' +
            'If everything looks good, click **Accept** to create the agent. ' +
            'Or tell me what you\'d like to change.'
          )
        } else {
          // Add as a rule
          const rule = userText.trim()
          if (rule.length > 3) {
            applySuggestions([{ action: 'add', field: 'rules', value: rule }])
            await addAssistantMessage(`Added rule: "${rule}". Any more rules, or say "done" to finalize?`)
          } else {
            await addAssistantMessage('That rule is too short. Please provide a meaningful rule, or say "done" to finalize.')
          }
        }
        break
      }

      case 'review': {
        const lower = userText.toLowerCase()
        if (/\b(accept|create|go|yes|confirm|looks good|perfect)\b/.test(lower)) {
          setStep('done')
          await addAssistantMessage('Forging your agent now! Stand by...')
          // Trigger creation
          setTimeout(() => onComplete(config), 800)
        } else if (/\b(change|modify|update|edit)\b/.test(lower)) {
          await addAssistantMessage('What would you like to change? You can say things like "change the name to X", "add skill Y", "remove rule Z".')
        } else if (/\b(add)\b/.test(lower)) {
          const skillMatch = lower.match(/add\s+(?:skill\s+)?["']?([a-z0-9_-]+)["']?/)
          if (skillMatch) {
            applySuggestions([{ action: 'add', field: 'skills', value: { name: skillMatch[1], description: 'User-requested skill' } }])
            await addAssistantMessage(`Added "${skillMatch[1]}". Ready to create?`)
          } else {
            await addAssistantMessage('What would you like to add?')
          }
        } else if (/\b(remove)\b/.test(lower)) {
          const match = lower.match(/remove\s+(?:skill\s+|rule\s+)?["']?([a-z0-9_-]+)["']?/)
          if (match) {
            applySuggestions([{ action: 'remove', field: 'skills', value: match[1] }])
            await addAssistantMessage(`Removed "${match[1]}". Ready to create?`)
          }
        } else if (/\b(name)\b/.test(lower)) {
          const nameMatch = lower.match(/name\s+(?:to\s+)?["']?([a-z0-9_-]+)["']?/)
          if (nameMatch) {
            applySuggestions([{ action: 'set', field: 'name', value: nameMatch[1] }])
            await addAssistantMessage(`Updated name to "${nameMatch[1]}". Ready to create?`)
          }
        } else {
          await addAssistantMessage('Ready to forge? Click **Accept** below, or tell me what to change.')
        }
        break
      }

      default:
        break
    }

    setSending(false)
  }, [step, config, applySuggestions, addAssistantMessage, onComplete])

  // Handle send
  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text || sending || step === 'done') return
    setInputText('')
    processMessage(text)
  }, [inputText, sending, step, processMessage])

  // Handle key press
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // Handle remove from config panel
  const handleRemove = useCallback((field: string, name: string) => {
    applySuggestions([{ action: 'remove', field, value: name }])
  }, [applySuggestions])

  const isBuilding = step !== 'review' && step !== 'done'
  const canAccept = step === 'review' && config.name

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-xl w-full max-w-5xl shadow-2xl border border-gray-700 overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh', height: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/50">
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
            {isBuilding && (
              <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Configuring...
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

        {/* Body: Left (chat) + Right (config panel) */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel - Chat */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 border-r border-gray-700/50">
            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                            : 'bg-amber-600 text-white rounded-tr-sm whitespace-pre-wrap'
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
                                const isBlock = className?.includes('language-')
                                if (isBlock) {
                                  return (
                                    <code className="block bg-gray-900 rounded-md px-3 py-2 my-2 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre">
                                      {children}
                                    </code>
                                  )
                                }
                                return <code className="bg-gray-900/60 rounded px-1 py-0.5 text-xs font-mono text-amber-200">{children}</code>
                              },
                              pre: ({ children }) => <pre className="my-2">{children}</pre>,
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
                              a: ({ href, children }) => <a href={href} className="text-amber-400 underline hover:text-amber-300" target="_blank" rel="noopener noreferrer">{children}</a>,
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
              {sending && (
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
            <div className="px-4 py-3 border-t border-gray-700/50">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={step === 'done' ? 'Agent created!' : getPlaceholder(step)}
                  disabled={step === 'done' || sending}
                  rows={1}
                  className="flex-1 text-sm bg-gray-800/50 text-gray-200 placeholder-gray-500 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50 max-h-20 disabled:opacity-40"
                  style={{ minHeight: '40px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || sending || step === 'done'}
                  className="p-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right panel - Config */}
          <AgentConfigPanel
            config={config}
            isBuilding={isBuilding}
            onRemove={handleRemove}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700/50">
          <button
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {getStepLabel(step)}
            </span>
            <button
              onClick={() => {
                if (canAccept) onComplete(config)
              }}
              disabled={!canAccept}
              className="px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-lg shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none text-sm flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Helpers ---

function getPlaceholder(step: ConversationStep): string {
  switch (step) {
    case 'purpose': return 'Describe the agent you need...'
    case 'name': return 'Enter agent name...'
    case 'skills': return 'Add, remove, or say "done"...'
    case 'mcp': return 'Add MCP servers or say "skip"...'
    case 'rules': return 'Add a rule or say "done"...'
    case 'review': return 'Request changes or say "accept"...'
    default: return 'Type a message...'
  }
}

function getStepLabel(step: ConversationStep): string {
  switch (step) {
    case 'greeting': return 'Starting...'
    case 'purpose': return 'Step 1: Purpose'
    case 'name': return 'Step 2: Naming'
    case 'skills': return 'Step 3: Skills'
    case 'mcp': return 'Step 4: MCP Servers'
    case 'rules': return 'Step 5: Rules'
    case 'review': return 'Review & Accept'
    case 'done': return 'Creating...'
    default: return ''
  }
}


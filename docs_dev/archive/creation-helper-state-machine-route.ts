import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

// --- Exported types for UI consumption ---

export interface ConfigSuggestion {
  action: 'set' | 'add' | 'remove'
  field: 'name' | 'program' | 'model' | 'role' | 'skills' | 'plugins' | 'mcpServers' | 'hooks' | 'rules' | 'workingDirectory' | 'tags'
  value: string | { name: string; description: string }
}

export interface AgentConfigDraft {
  name?: string
  program?: string
  model?: string
  role?: 'manager' | 'chief-of-staff' | 'member'
  workingDirectory?: string
  skills: Array<{ name: string; description: string }>
  plugins: Array<{ name: string; description: string }>
  mcpServers: Array<{ name: string; description: string }>
  hooks: Array<{ name: string; description: string }>
  rules: string[]
  tags: string[]
}

export type ConversationStep = 'greeting' | 'purpose' | 'skills' | 'plugins' | 'mcp' | 'rules' | 'review' | 'done'

interface ChatRequest { message: string; context: { step: ConversationStep; config: AgentConfigDraft } }
interface ChatResponse { reply: string; suggestions: ConfigSuggestion[]; nextStep: ConversationStep }

// --- Compact helper type for profile skill/plugin/mcp entries ---
type Entry = { name: string; description: string }

type ProfileKey = 'development' | 'research' | 'operations' | 'documentation' | 'data' | 'general'
interface Profile { program: string; model: string; skills: Entry[]; plugins: Entry[]; mcpServers: Entry[]; rules: string[]; tags: string[] }

// Shorthand factory for profile entries
const e = (name: string, description: string): Entry => ({ name, description })

const PROFILES: Record<ProfileKey, Profile> = {
  development: {
    program: 'claude', model: 'sonnet',
    skills: [e('tdd', 'Test-driven development workflow'), e('git-workflow', 'Git branching and commit conventions'), e('github-workflow', 'GitHub PRs, issues, and CI integration')],
    plugins: [], mcpServers: [],
    rules: ['Write tests before code', 'Use feature branches'], tags: ['developer', 'coding'],
  },
  research: {
    program: 'claude', model: 'sonnet',
    skills: [e('research-agent', 'Web research and source gathering'), e('planning', 'Task decomposition and planning'), e('memory-search', 'Semantic search over past conversations')],
    plugins: [], mcpServers: [],
    rules: ['Cite sources', 'Verify claims before reporting'], tags: ['research', 'analysis'],
  },
  operations: {
    program: 'claude', model: 'sonnet',
    skills: [e('ai-maestro-agents-management', 'Agent lifecycle management'), e('team-governance', 'Team governance and role enforcement'), e('planning', 'Task decomposition and planning')],
    plugins: [], mcpServers: [],
    rules: ['Check health before operations', 'Log all state changes'], tags: ['ops', 'infrastructure'],
  },
  documentation: {
    program: 'claude', model: 'sonnet',
    skills: [e('planning', 'Task decomposition and planning'), e('create-handoff', 'Create structured handoff documents')],
    plugins: [], mcpServers: [],
    rules: ['Keep docs concise', 'Include examples for every feature'], tags: ['docs', 'writing'],
  },
  data: {
    program: 'claude', model: 'sonnet',
    skills: [e('planning', 'Task decomposition and planning')],
    plugins: [], mcpServers: [e('filesystem', 'Local file access for data pipelines')],
    rules: ['Validate data before processing', 'Document schema assumptions'], tags: ['data', 'analysis'],
  },
  general: {
    program: 'claude', model: 'sonnet',
    skills: [e('planning', 'Task decomposition and planning')],
    plugins: [], mcpServers: [], rules: [], tags: [],
  },
}

// Core skill always suggested for every agent
const CORE_SKILL = e('agent-messaging', 'Inter-agent messaging via AMP protocol')

// --- Purpose detection from free-text message ---

const KEYWORD_MAP: Array<{ key: ProfileKey; keywords: string[] }> = [
  { key: 'development', keywords: ['code', 'develop', 'build', 'implement', 'fix', 'program', 'debug', 'refactor'] },
  { key: 'research', keywords: ['research', 'search', 'analyze', 'explore', 'investigate', 'study'] },
  { key: 'operations', keywords: ['deploy', 'monitor', 'manage', 'ops', 'infra', 'devops', 'maintain'] },
  { key: 'documentation', keywords: ['write', 'document', 'content', 'docs', 'technical writing'] },
  { key: 'data', keywords: ['data', 'ml', 'analysis', 'visualiz', 'machine learning', 'dataset', 'pipeline'] },
]

function detectProfile(message: string): ProfileKey {
  const lower = message.toLowerCase()
  for (const { key, keywords } of KEYWORD_MAP) {
    if (keywords.some(kw => lower.includes(kw))) return key
  }
  return 'general'
}

function detectProfileFromConfig(config: AgentConfigDraft, message: string): ProfileKey {
  const tagSet = new Set(config.tags.map(t => t.toLowerCase()))
  if (tagSet.has('developer') || tagSet.has('coding')) return 'development'
  if (tagSet.has('research') || tagSet.has('analysis')) return 'research'
  if (tagSet.has('ops') || tagSet.has('infrastructure')) return 'operations'
  if (tagSet.has('docs') || tagSet.has('writing')) return 'documentation'
  if (tagSet.has('data')) return 'data'
  return detectProfile(message)
}

// --- Suggestion builder helpers ---

/** Build add-suggestions for entries not already present in existingNames */
function suggestEntries(field: ConfigSuggestion['field'], entries: Entry[], existing: Set<string>): ConfigSuggestion[] {
  return entries.filter(item => !existing.has(item.name)).map(item => ({ action: 'add' as const, field, value: item }))
}

// --- Conversational step handlers ---

function handleGreeting(): ChatResponse {
  return {
    reply: 'Welcome to the agent creation helper! What kind of agent do you need? Describe its purpose -- for example: "a coding agent for my backend repo" or "a research agent that analyzes papers".',
    suggestions: [], nextStep: 'purpose',
  }
}

function handlePurpose(message: string): ChatResponse {
  const profileKey = detectProfile(message)
  const profile = PROFILES[profileKey]
  const suggestions: ConfigSuggestion[] = [
    { action: 'set', field: 'program', value: profile.program },
    { action: 'set', field: 'model', value: profile.model },
  ]
  for (const tag of profile.tags) suggestions.push({ action: 'add', field: 'tags', value: tag })
  // Extract a name hint if user said "called X" or "named X"
  const nameMatch = message.match(/(?:called|named)\s+["']?([a-zA-Z0-9_-]+)["']?/i)
  if (nameMatch) suggestions.push({ action: 'set', field: 'name', value: nameMatch[1] })
  const label = profileKey === 'general' ? 'general-purpose' : profileKey
  return {
    reply: `Got it -- sounds like a **${label}** agent. I suggest **${profile.program}** with the **${profile.model}** model. Next, let me suggest some skills. Does this direction look right?`,
    suggestions, nextStep: 'skills',
  }
}

function handleSkills(message: string, config: AgentConfigDraft): ChatResponse {
  const profileKey = detectProfileFromConfig(config, message)
  const profile = PROFILES[profileKey]
  const existing = new Set(config.skills.map(s => s.name))
  const suggestions = [
    ...(!existing.has(CORE_SKILL.name) ? [{ action: 'add' as const, field: 'skills' as const, value: CORE_SKILL }] : []),
    ...suggestEntries('skills', profile.skills, existing),
  ]
  const names = profile.skills.map(s => s.name).join(', ')
  return {
    reply: `For a ${profileKey} agent, I recommend: **${names}**, plus **agent-messaging** (required for inter-agent communication). Accept these or tell me which to add/remove.`,
    suggestions, nextStep: 'plugins',
  }
}

function handlePlugins(message: string, config: AgentConfigDraft): ChatResponse {
  const profileKey = detectProfileFromConfig(config, message)
  const profile = PROFILES[profileKey]
  const suggestions = suggestEntries('plugins', profile.plugins, new Set(config.plugins.map(p => p.name)))
  const reply = profile.plugins.length > 0
    ? `I suggest these plugins: **${profile.plugins.map(p => p.name).join(', ')}**. Want to add or skip any?`
    : 'No specific plugins needed for this agent type. You can always add them later. Moving on to MCP servers.'
  return { reply, suggestions, nextStep: 'mcp' }
}

function handleMcp(message: string, config: AgentConfigDraft): ChatResponse {
  const profileKey = detectProfileFromConfig(config, message)
  const profile = PROFILES[profileKey]
  const suggestions = suggestEntries('mcpServers', profile.mcpServers, new Set(config.mcpServers.map(m => m.name)))
  const reply = profile.mcpServers.length > 0
    ? `For data access, I suggest: **${profile.mcpServers.map(m => m.name).join(', ')}**. Accept or adjust?`
    : 'No MCP servers needed by default. You can configure them later. Let me suggest some rules next.'
  return { reply, suggestions, nextStep: 'rules' }
}

function handleRules(message: string, config: AgentConfigDraft): ChatResponse {
  const profileKey = detectProfileFromConfig(config, message)
  const profile = PROFILES[profileKey]
  const existingRules = new Set(config.rules)
  const suggestions: ConfigSuggestion[] = profile.rules.filter(r => !existingRules.has(r)).map(r => ({ action: 'add', field: 'rules', value: r }))
  // New agents always start as member role
  suggestions.push({ action: 'set', field: 'role', value: 'member' })
  const rulesText = profile.rules.length > 0 ? profile.rules.map(r => `- ${r}`).join('\n') : '(none -- you can add custom rules)'
  return {
    reply: `Suggested rules:\n${rulesText}\n\nNote: new agents are always created with the **member** role. Promotion happens through governance after creation. Ready to review?`,
    suggestions, nextStep: 'review',
  }
}

function handleReview(config: AgentConfigDraft): ChatResponse {
  const lines: string[] = ['Here is your agent configuration:']
  if (config.name) lines.push(`**Name:** ${config.name}`)
  lines.push(`**Program:** ${config.program || 'claude'}`)
  lines.push(`**Model:** ${config.model || 'sonnet'}`)
  lines.push(`**Role:** ${config.role || 'member'}`)
  if (config.workingDirectory) lines.push(`**Working Directory:** ${config.workingDirectory}`)
  if (config.skills.length > 0) lines.push(`**Skills:** ${config.skills.map(s => s.name).join(', ')}`)
  if (config.plugins.length > 0) lines.push(`**Plugins:** ${config.plugins.map(p => p.name).join(', ')}`)
  if (config.mcpServers.length > 0) lines.push(`**MCP Servers:** ${config.mcpServers.map(m => m.name).join(', ')}`)
  if (config.rules.length > 0) lines.push(`**Rules:**\n${config.rules.map(r => `- ${r}`).join('\n')}`)
  if (config.tags.length > 0) lines.push(`**Tags:** ${config.tags.join(', ')}`)
  lines.push('\nSay **"create"** to finalize, or tell me what to change.')
  return { reply: lines.join('\n'), suggestions: [], nextStep: 'done' }
}

function handleDone(): ChatResponse {
  return { reply: 'Agent configuration finalized! The UI will now create the agent with these settings.', suggestions: [], nextStep: 'done' }
}

// --- Route handler ---

/**
 * POST /api/agents/creation-helper
 * Scripted conversational flow for guided agent creation.
 * Accepts a chat message with conversation context, returns reply with config suggestions and next step.
 */
export async function POST(request: NextRequest) {
  try {
    let body: ChatRequest
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { message, context } = body
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required and must be a string' }, { status: 400 })
    }
    if (!context || !context.step || !context.config) {
      return NextResponse.json({ error: 'context with step and config is required' }, { status: 400 })
    }
    // Defensive: ensure config arrays exist for partial payloads
    const config: AgentConfigDraft = {
      ...context.config,
      skills: context.config.skills || [], plugins: context.config.plugins || [],
      mcpServers: context.config.mcpServers || [], hooks: context.config.hooks || [],
      rules: context.config.rules || [], tags: context.config.tags || [],
    }
    // If user confirms during review/done step, finalize immediately
    const lower = message.toLowerCase().trim()
    if ((context.step === 'review' || context.step === 'done') &&
        (lower === 'create' || lower.includes('finalize') || lower.includes('looks good') || lower.includes('confirm'))) {
      return NextResponse.json(handleDone())
    }
    let response: ChatResponse
    switch (context.step) {
      case 'greeting': response = handleGreeting(); break
      case 'purpose': response = handlePurpose(message); break
      case 'skills': response = handleSkills(message, config); break
      case 'plugins': response = handlePlugins(message, config); break
      case 'mcp': response = handleMcp(message, config); break
      case 'rules': response = handleRules(message, config); break
      case 'review': response = handleReview(config); break
      case 'done': response = handleDone(); break
      default: response = handleGreeting()
    }
    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

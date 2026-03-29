'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowLeft, ChevronRight, Check, Lock } from 'lucide-react'
import Image from 'next/image'
import CreateAgentAnimation, { getPreviewAvatarUrl } from './CreateAgentAnimation'
import type { Team } from '@/types/team'
import type { AgentRole } from '@/types/agent'
import type { RolePlugin } from '@/services/role-plugin-service'

// --- Types ---

type WizardStep = 'client' | 'avatar' | 'team' | 'title' | 'role-plugin' | 'summary' | 'creating' | 'done'

interface ChatMessage {
  id: string
  role: 'robot' | 'user'
  text: string
  step: WizardStep
  widget?: 'client-picker' | 'avatar-picker' | 'team-picker' | 'title-picker' | 'role-plugin-picker' | 'summary'
  widgetData?: Record<string, unknown>
}

// --- Constants ---

// Titles available when an agent is assigned to a team
const TEAM_TITLES: Array<{ value: AgentRole; label: string; description: string }> = [
  { value: 'member', label: 'MEMBER', description: 'Default team member' },
  { value: 'chief-of-staff', label: 'CHIEF-OF-STAFF', description: 'Coordinates the team on behalf of the MANAGER' },
  { value: 'architect', label: 'ARCHITECT', description: 'Designs technical solutions' },
  { value: 'orchestrator', label: 'ORCHESTRATOR', description: 'Manages tasks and kanban' },
  { value: 'integrator', label: 'INTEGRATOR', description: 'Handles integrations and APIs' },
]

// Titles available when an agent has no team (autonomous)
const AUTONOMOUS_TITLES: Array<{ value: AgentRole; label: string; description: string }> = [
  { value: 'autonomous', label: 'AUTONOMOUS', description: 'Independent agent, no team assigned' },
  { value: 'manager', label: 'MANAGER', description: 'Oversees the entire multi-agent system (singleton)' },
]

// Title colors matching TitleBadge conventions
const TITLE_COLORS: Record<AgentRole, string> = {
  manager: 'border-red-500/60 bg-red-500/10 text-red-400',
  'chief-of-staff': 'border-yellow-500/60 bg-yellow-500/10 text-yellow-400',
  architect: 'border-purple-500/60 bg-purple-500/10 text-purple-400',
  orchestrator: 'border-blue-500/60 bg-blue-500/10 text-blue-400',
  integrator: 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400',
  member: 'border-gray-500/60 bg-gray-500/10 text-gray-400',
  autonomous: 'border-gray-500/60 bg-gray-500/10 text-gray-400',
}

// Titles that automatically lock to their predefined role-plugin (not user-selectable)
const LOCKED_TITLE_PLUGINS: Partial<Record<AgentRole, string>> = {
  manager: 'ai-maestro-assistant-manager-agent',
  'chief-of-staff': 'ai-maestro-chief-of-staff',
  architect: 'ai-maestro-architect-agent',
  orchestrator: 'ai-maestro-orchestrator-agent',
  integrator: 'ai-maestro-integrator-agent',
}

// Titles for which the user can freely choose a role-plugin
const SELECTABLE_PLUGIN_TITLES: AgentRole[] = ['member', 'autonomous']

// Avatar category helpers
const AVATAR_COUNTS = { men: 100, women: 100, robots: 55 }
type AvatarCategory = 'men' | 'women' | 'robots'

function getAvatarUrl(category: AvatarCategory, index: number): string {
  return `/avatars/${category}_${index.toString().padStart(2, '0')}.jpg`
}

// --- Step order (visible navigation steps only) ---

// Step order — role-plugin step only shown if client supports plugins
const STEP_ORDER_WITH_PLUGINS: WizardStep[] = ['client', 'avatar', 'team', 'title', 'role-plugin', 'summary']
const STEP_ORDER_NO_PLUGINS: WizardStep[] = ['client', 'avatar', 'team', 'title', 'summary']

let msgCounter = 0
function makeMsg(
  role: 'robot' | 'user',
  text: string,
  step: WizardStep,
  widget?: ChatMessage['widget'],
  widgetData?: Record<string, unknown>
): ChatMessage {
  return { id: `msg-${++msgCounter}-${Math.random().toString(36).slice(2, 6)}`, role, text, step, widget, widgetData }
}

function robotQuestion(step: WizardStep): ChatMessage {
  switch (step) {
    case 'client':
      return makeMsg('robot', 'What AI client will this agent use?', step, 'client-picker')
    case 'avatar':
      return makeMsg('robot', "Let's start! Pick an avatar and give this agent a persona name.", step, 'avatar-picker')
    case 'team':
      return makeMsg('robot', 'Should this agent belong to a team?', step, 'team-picker')
    case 'title':
      return makeMsg('robot', 'What governance title should this agent hold?', step, 'title-picker')
    case 'role-plugin':
      return makeMsg('robot', "Choose a role plugin to define this agent's specialization.", step, 'role-plugin-picker')
    case 'summary':
      return makeMsg('robot', "Here's your new agent — ready to bring it to life?", step, 'summary')
    default:
      return makeMsg('robot', '', step)
  }
}

// --- Props ---

interface AgentCreationWizardProps {
  onClose: () => void
  onComplete: () => void
}

// --- Component ---

export default function AgentCreationWizard({ onClose, onComplete }: AgentCreationWizardProps) {
  const [robotAvatarIndex] = useState(() => Math.floor(Math.random() * 55))
  const robotAvatarUrl = `/avatars/robots_${robotAvatarIndex.toString().padStart(2, '0')}.jpg`

  const chatEndRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [step, setStep] = useState<WizardStep>('client')

  // Wizard state
  const [selectedClient, setSelectedClient] = useState<string>('claude')  // AI client program
  const [selectedAvatar, setSelectedAvatar] = useState<string>('')
  const [personaName, setPersonaName] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)  // null = no team
  const [selectedTitle, setSelectedTitle] = useState<AgentRole>('autonomous')
  const [selectedPlugin, setSelectedPlugin] = useState<RolePlugin | null>(null)

  // Dynamic step order based on client capabilities (only plugin-supporting clients see role-plugin step)
  const clientSupportsPlugins = selectedClient === 'claude' || selectedClient === 'codex'
  const STEP_ORDER = clientSupportsPlugins ? STEP_ORDER_WITH_PLUGINS : STEP_ORDER_NO_PLUGINS

  // Teams & plugins data
  const [teams, setTeams] = useState<Team[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [plugins, setPlugins] = useState<RolePlugin[]>([])
  const [pluginsLoading, setPluginsLoading] = useState(false)

  // Creation animation state
  const [isCreating, setIsCreating] = useState(false)
  const [animationPhase, setAnimationPhase] = useState<'preparing' | 'creating' | 'ready' | 'error'>('preparing')
  const [animationProgress, setAnimationProgress] = useState(0)
  const [creationSuccess, setCreationSuccess] = useState(false)
  const [showLetsGo, setShowLetsGo] = useState(false)
  const [creationError, setCreationError] = useState('')

  // Input state for avatar step
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState('')
  const [activeAvatarCategory, setActiveAvatarCategory] = useState<AvatarCategory>('men')
  const [avatarPage, setAvatarPage] = useState(0)

  // Only the latest step gets an interactive widget
  const [activeWidgetStep, setActiveWidgetStep] = useState<WizardStep | null>(null)

  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
    }
  }, [])

  // Initialize first question on mount
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (initialized) return
    setInitialized(true)
    setTimeout(() => {
      setMessages([
        makeMsg('robot', "Hey! I'm here to help you set up a new agent.", 'client'),
        robotQuestion('client'),
      ])
      setActiveWidgetStep('client')
    }, 200)
  }, [initialized])

  // Fetch teams when team step becomes active
  useEffect(() => {
    if (step !== 'team') return
    setTeamsLoading(true)
    fetch('/api/teams')
      .then(r => r.ok ? r.json() : { teams: [] })
      .then(data => setTeams(Array.isArray(data.teams) ? data.teams : []))
      .catch(() => setTeams([]))
      .finally(() => setTeamsLoading(false))
  }, [step])

  // Fetch plugins when role-plugin step becomes active (only for selectable titles)
  useEffect(() => {
    if (step !== 'role-plugin') return
    if (!SELECTABLE_PLUGIN_TITLES.includes(selectedTitle)) return
    setPluginsLoading(true)
    fetch(`/api/agents/role-plugins?title=${selectedTitle.toUpperCase()}`)
      .then(r => r.ok ? r.json() : { plugins: [] })
      .then(data => setPlugins(Array.isArray(data.plugins) ? data.plugins : []))
      .catch(() => setPlugins([]))
      .finally(() => setPluginsLoading(false))
  }, [step, selectedTitle])

  // Auto-scroll on new messages
  useEffect(() => {
    const timer = setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
    return () => clearTimeout(timer)
  }, [messages, showLetsGo, isCreating])

  // Advance to next step with user answer bubble + delayed robot question
  const advance = useCallback((userText: string, nextStep: WizardStep) => {
    const userMsg = makeMsg('user', userText, step)
    setMessages(prev => [...prev, userMsg])
    setActiveWidgetStep(null)

    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
    transitionTimerRef.current = setTimeout(() => {
      transitionTimerRef.current = null
      setStep(nextStep)
      setActiveWidgetStep(nextStep)
      setMessages(prev => [...prev, robotQuestion(nextStep)])
    }, 400)
  }, [step])

  // Go back one step
  const goBack = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }

    const idx = STEP_ORDER.indexOf(step)
    if (idx <= 0) return

    const prevStep = STEP_ORDER[idx - 1]

    // Remove current step messages + previous step's user answer
    setMessages(msgs => msgs.filter(m => m.step !== step && !(m.step === prevStep && m.role === 'user')))
    setStep(prevStep)
    setActiveWidgetStep(prevStep)
  }, [step])

  // --- Handlers ---

  const handleAvatarSubmit = useCallback(() => {
    const trimmed = nameInput.trim()
    if (!trimmed) return
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(trimmed)) {
      setNameError('Only letters, numbers, spaces, dashes, and underscores')
      return
    }
    const avatar = selectedAvatar || getPreviewAvatarUrl(trimmed)
    setPersonaName(trimmed)
    setSelectedAvatar(avatar)
    setNameError('')
    advance(trimmed, 'team')
  }, [nameInput, selectedAvatar, advance])

  const handleTeamSelect = useCallback((teamId: string | null) => {
    setSelectedTeamId(teamId)
    // Set default title based on team context
    const defaultTitle: AgentRole = teamId ? 'member' : 'autonomous'
    setSelectedTitle(defaultTitle)
    const label = teamId
      ? (teams.find(t => t.id === teamId)?.name ?? teamId)
      : 'No team (Autonomous)'
    advance(label, 'title')
  }, [teams, advance])

  const handleTitleSelect = useCallback((title: AgentRole) => {
    setSelectedTitle(title)
    // Titles with a locked plugin skip the role-plugin step
    if (LOCKED_TITLE_PLUGINS[title]) {
      setSelectedPlugin(null)  // resolved during creation
      advance(title.toUpperCase(), 'summary')
    } else {
      advance(title.toUpperCase(), 'role-plugin')
    }
  }, [advance])

  const handlePluginSelect = useCallback((plugin: RolePlugin | null) => {
    setSelectedPlugin(plugin)
    const label = plugin ? plugin.name : 'Default (Programmer)'
    advance(label, 'summary')
  }, [advance])

  // --- Create agent ---
  const handleCreate = useCallback(async () => {
    setIsCreating(true)
    setStep('creating')
    setMessages(prev => [...prev, makeMsg('user', "Let's do it!", 'summary')])

    // Derive slug-style internal agent name from persona name
    const agentName = personaName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '')
    const avatar = selectedAvatar || getPreviewAvatarUrl(personaName)

    try {
      // Step 1: Create tmux session + register agent
      const response = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          label: personaName,
          avatar,
          program: selectedClient,
          role: selectedTitle,
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create agent')
      }
      const created = await response.json()
      const agentId: string = created?.agentId ?? created?.id ?? agentName

      // Step 2: Add to team if one was selected
      if (selectedTeamId) {
        try {
          const teamRes = await fetch(`/api/teams/${selectedTeamId}`)
          if (teamRes.ok) {
            const teamData = await teamRes.json()
            const existingIds: string[] = teamData?.team?.agentIds ?? []
            if (!existingIds.includes(agentId)) {
              await fetch(`/api/teams/${selectedTeamId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentIds: [...existingIds, agentId] }),
              })
            }
          }
        } catch {
          // Non-fatal: team add failure shouldn't block agent creation
        }
      }

      // Step 3: Auto-assign role plugin
      const lockedPlugin = LOCKED_TITLE_PLUGINS[selectedTitle]
      const pluginName = lockedPlugin ?? selectedPlugin?.name
      if (pluginName) {
        try {
          await fetch('/api/agents/create-persona', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personaName, pluginName }),
          })
        } catch {
          // Non-fatal: plugin install may fail if marketplace not synced yet
        }
      }

      setCreationSuccess(true)
    } catch (err) {
      setCreationError(err instanceof Error ? err.message : 'Failed to create agent')
      setAnimationPhase('error')
      setIsCreating(false)
    }
  }, [personaName, selectedAvatar, selectedTitle, selectedTeamId, selectedPlugin])

  // Animation timer sequence
  useEffect(() => {
    if (!isCreating) return
    setAnimationPhase('preparing')
    setAnimationProgress(5)

    const timers = [
      setTimeout(() => setAnimationProgress(12), 500),
      setTimeout(() => setAnimationProgress(20), 1000),
      setTimeout(() => setAnimationProgress(28), 1800),
      setTimeout(() => { setAnimationPhase('creating'); setAnimationProgress(35) }, 2500),
      setTimeout(() => setAnimationProgress(45), 3200),
      setTimeout(() => setAnimationProgress(55), 3900),
      setTimeout(() => setAnimationProgress(65), 4600),
      setTimeout(() => setAnimationProgress(78), 5300),
      setTimeout(() => setAnimationProgress(90), 6000),
      setTimeout(() => { setAnimationPhase('ready'); setAnimationProgress(100) }, 6500),
      setTimeout(() => { if (creationSuccess) setShowLetsGo(true) }, 8000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [isCreating, creationSuccess])

  useEffect(() => {
    if (creationSuccess && animationPhase === 'ready') {
      const timer = setTimeout(() => setShowLetsGo(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [creationSuccess, animationPhase])

  // --- Computed ---
  const stepIndex = STEP_ORDER.indexOf(step)
  const totalSteps = STEP_ORDER.length
  const stepNumber = stepIndex >= 0 ? stepIndex + 1 : 1
  const canGoBack = step !== 'creating' && step !== 'done' && STEP_ORDER.indexOf(step) > 0

  // --- Render ---
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={isCreating ? undefined : onClose}>
      <div
        className="bg-gray-900 rounded-xl w-full max-w-3xl shadow-2xl border border-gray-700 overflow-hidden flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/50">
          <h3 className="text-base font-semibold text-gray-100">New Agent Setup</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Left (robot) + Right (chat) */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel - Robot avatar */}
          <div className="hidden md:flex w-[45%] items-center justify-center bg-gray-950/60 p-6 relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-56 rounded-full bg-blue-500/10 blur-3xl" />
            </div>
            <div className="relative">
              <motion.div
                className="absolute -inset-3 rounded-full bg-gradient-to-br from-blue-500/30 via-purple-500/20 to-cyan-500/30 blur-md"
                animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.98, 1.02, 0.98] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />
              <Image
                src={robotAvatarUrl}
                alt="Robot assistant"
                width={176}
                height={176}
                className="w-44 h-44 rounded-full object-cover ring-2 ring-blue-500/40 relative z-10"
              />
            </div>
          </div>

          {/* Right panel - Chat */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {isCreating ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6">
                <div className="text-center mb-2">
                  <h3 className="text-lg font-semibold text-gray-100">
                    {animationPhase === 'ready' ? 'Your Agent is Ready!' : 'Creating Your Agent'}
                  </h3>
                  {animationPhase !== 'ready' && <p className="text-sm text-gray-400">{personaName}</p>}
                </div>
                <CreateAgentAnimation
                  phase={animationPhase}
                  agentName={personaName.toLowerCase().replace(/\s+/g, '-')}
                  agentAlias={personaName}
                  avatarUrl={selectedAvatar || getPreviewAvatarUrl(personaName)}
                  progress={animationProgress}
                  showNextSteps={showLetsGo}
                />
                {showLetsGo && (
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={onComplete}
                      className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all duration-300 transform hover:scale-105 flex items-center gap-2"
                    >
                      Let&apos;s Go! 🚀
                    </button>
                  </div>
                )}
                {creationError && (
                  <div className="mt-4 text-center">
                    <p className="text-red-400 text-sm mb-3">{creationError}</p>
                    <button
                      onClick={() => {
                        setIsCreating(false)
                        setCreationError('')
                        setStep('summary')
                        setActiveWidgetStep('summary')
                      }}
                      className="px-4 py-2 text-sm bg-gray-800 text-gray-200 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Go Back
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <ChatBubble
                      key={msg.id}
                      message={msg}
                      robotAvatarUrl={robotAvatarUrl}
                      isActiveWidget={msg.role === 'robot' && msg.widget !== undefined && msg.step === activeWidgetStep}
                      // Client step props
                      selectedClient={selectedClient}
                      onClientSelect={(clientId) => { setSelectedClient(clientId); advance(`${clientId}`, 'avatar') }}
                      // Avatar step props
                      nameInput={nameInput}
                      nameError={nameError}
                      selectedAvatar={selectedAvatar}
                      activeAvatarCategory={activeAvatarCategory}
                      avatarPage={avatarPage}
                      onNameChange={(v) => { setNameInput(v); setNameError('') }}
                      onAvatarSelect={setSelectedAvatar}
                      onAvatarCategoryChange={setActiveAvatarCategory}
                      onAvatarPageChange={setAvatarPage}
                      onAvatarSubmit={handleAvatarSubmit}
                      // Team step props
                      teams={teams}
                      teamsLoading={teamsLoading}
                      onTeamSelect={handleTeamSelect}
                      // Title step props
                      selectedTeamId={selectedTeamId}
                      onTitleSelect={handleTitleSelect}
                      // Role-plugin step props
                      plugins={plugins}
                      pluginsLoading={pluginsLoading}
                      selectedTitle={selectedTitle}
                      onPluginSelect={handlePluginSelect}
                      // Summary props
                      state={{ personaName, selectedTeamId, selectedTitle, selectedPlugin, selectedAvatar, teams }}
                      onCreate={handleCreate}
                    />
                  ))}
                </AnimatePresence>
                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {!isCreating && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700/50">
            <div>
              {canGoBack && (
                <button
                  onClick={goBack}
                  className="text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                Step {stepNumber} of {totalSteps}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: totalSteps }, (_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i < stepNumber ? 'bg-blue-500' : 'bg-gray-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Chat Bubble ---

interface ChatBubbleProps {
  message: ChatMessage
  robotAvatarUrl: string
  isActiveWidget: boolean
  // Client step
  selectedClient: string
  onClientSelect: (clientId: string) => void
  // Avatar step
  nameInput: string
  nameError: string
  selectedAvatar: string
  activeAvatarCategory: AvatarCategory
  avatarPage: number
  onNameChange: (v: string) => void
  onAvatarSelect: (url: string) => void
  onAvatarCategoryChange: (cat: AvatarCategory) => void
  onAvatarPageChange: (page: number) => void
  onAvatarSubmit: () => void
  // Team step
  teams: Team[]
  teamsLoading: boolean
  onTeamSelect: (teamId: string | null) => void
  // Title step
  selectedTeamId: string | null
  onTitleSelect: (title: AgentRole) => void
  // Role-plugin step
  plugins: RolePlugin[]
  pluginsLoading: boolean
  selectedTitle: AgentRole
  onPluginSelect: (plugin: RolePlugin | null) => void
  // Summary
  state: {
    personaName: string
    selectedTeamId: string | null
    selectedTitle: AgentRole
    selectedPlugin: RolePlugin | null
    selectedAvatar: string
    teams: Team[]
  }
  onCreate: () => void
}

function ChatBubble({
  message,
  robotAvatarUrl,
  isActiveWidget,
  selectedClient,
  onClientSelect,
  nameInput,
  nameError,
  selectedAvatar,
  activeAvatarCategory,
  avatarPage,
  onNameChange,
  onAvatarSelect,
  onAvatarCategoryChange,
  onAvatarPageChange,
  onAvatarSubmit,
  teams,
  teamsLoading,
  onTeamSelect,
  selectedTeamId,
  onTitleSelect,
  plugins,
  pluginsLoading,
  selectedTitle,
  onPluginSelect,
  state,
  onCreate,
}: ChatBubbleProps) {
  const isRobot = message.role === 'robot'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex ${isRobot ? 'justify-start' : 'justify-end'}`}
    >
      {isRobot && (
        <div className="flex-shrink-0 mr-2 mt-1">
          <Image src={robotAvatarUrl} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover ring-1 ring-gray-700" />
        </div>
      )}
      <div className="max-w-[90%]">
        <div
          className={`rounded-xl px-3.5 py-2.5 text-sm ${
            isRobot
              ? 'bg-gray-800 text-gray-200 rounded-tl-sm'
              : 'bg-blue-600 text-white rounded-tr-sm'
          }`}
        >
          {message.text}
        </div>

        {/* Widget area — only rendered for the active robot message */}
        {isRobot && message.widget && isActiveWidget && (
          <div className="mt-2">
            {message.widget === 'client-picker' && (
              <div className="grid grid-cols-2 gap-2 max-w-md">
                {[
                  { id: 'claude', label: 'Claude Code', desc: 'Full plugin support', icon: '🟣' },
                  { id: 'codex', label: 'Codex', desc: 'Plugin support', icon: '🟢' },
                  { id: 'gemini', label: 'Gemini CLI', desc: 'No plugin support', icon: '🔵' },
                  { id: 'aider', label: 'Aider', desc: 'No plugin support', icon: '🟡' },
                  { id: 'opencode', label: 'OpenCode', desc: 'No plugin support', icon: '⚪' },
                ].map(c => (
                  <button
                    key={c.id}
                    onClick={() => onClientSelect(c.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all text-left ${
                      selectedClient === c.id
                        ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                        : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                    }`}
                  >
                    <span className="text-lg">{c.icon}</span>
                    <div>
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="text-[10px] text-gray-500">{c.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {message.widget === 'avatar-picker' && (
              <AvatarPickerWidget
                nameInput={nameInput}
                nameError={nameError}
                selectedAvatar={selectedAvatar}
                activeCategory={activeAvatarCategory}
                page={avatarPage}
                onNameChange={onNameChange}
                onAvatarSelect={onAvatarSelect}
                onCategoryChange={onAvatarCategoryChange}
                onPageChange={onAvatarPageChange}
                onSubmit={onAvatarSubmit}
              />
            )}

            {message.widget === 'team-picker' && (
              <TeamPickerWidget
                teams={teams}
                loading={teamsLoading}
                onSelect={onTeamSelect}
              />
            )}

            {message.widget === 'title-picker' && (
              <TitlePickerWidget
                selectedTeamId={selectedTeamId}
                onSelect={onTitleSelect}
              />
            )}

            {message.widget === 'role-plugin-picker' && (
              <RolePluginPickerWidget
                plugins={plugins}
                loading={pluginsLoading}
                selectedTitle={selectedTitle}
                onSelect={onPluginSelect}
              />
            )}

            {message.widget === 'summary' && (
              <SummaryCard
                state={state}
                onCreate={onCreate}
              />
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// --- Widgets ---

// Step 1: Avatar + Persona Name
function AvatarPickerWidget({
  nameInput,
  nameError,
  selectedAvatar,
  activeCategory,
  page,
  onNameChange,
  onAvatarSelect,
  onCategoryChange,
  onPageChange,
  onSubmit,
}: {
  nameInput: string
  nameError: string
  selectedAvatar: string
  activeCategory: AvatarCategory
  page: number
  onNameChange: (v: string) => void
  onAvatarSelect: (url: string) => void
  onCategoryChange: (cat: AvatarCategory) => void
  onPageChange: (p: number) => void
  onSubmit: () => void
}) {
  const AVATARS_PER_PAGE = 12
  const total = AVATAR_COUNTS[activeCategory]
  const totalPages = Math.ceil(total / AVATARS_PER_PAGE)
  const startIndex = page * AVATARS_PER_PAGE
  const avatarIndices = Array.from(
    { length: Math.min(AVATARS_PER_PAGE, total - startIndex) },
    (_, i) => startIndex + i
  )

  const categories: Array<{ key: AvatarCategory; label: string }> = [
    { key: 'men', label: 'Men' },
    { key: 'women', label: 'Women' },
    { key: 'robots', label: 'Robots' },
  ]

  return (
    <div className="rounded-xl bg-gray-800/60 border border-gray-700 p-3 space-y-3">
      {/* Persona name input */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Persona Name</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
            placeholder="e.g. Alex-Bot"
            autoFocus
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={onSubmit}
            disabled={!nameInput.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
        {!nameError && (
          <p className="text-xs text-gray-500 mt-1">Letters, numbers, spaces, dashes, and underscores</p>
        )}
      </div>

      {/* Avatar grid */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">
          Avatar <span className="text-gray-600">(optional)</span>
        </label>
        <div className="flex gap-1 mb-2">
          {categories.map(cat => (
            <button
              key={cat.key}
              onClick={() => { onCategoryChange(cat.key); onPageChange(0) }}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                activeCategory === cat.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-6 gap-1.5">
          {avatarIndices.map((idx) => {
            const url = getAvatarUrl(activeCategory, idx)
            const isSelected = selectedAvatar === url
            return (
              <div
                key={url}
                onClick={() => onAvatarSelect(isSelected ? '' : url)}
                className={`relative cursor-pointer rounded-lg overflow-hidden ring-2 transition-all ${
                  isSelected ? 'ring-blue-500 scale-105' : 'ring-transparent hover:ring-gray-500'
                }`}
              >
                <Image
                  src={url}
                  alt=""
                  width={48}
                  height={48}
                  className="w-full aspect-square object-cover"
                />
                {isSelected && (
                  <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-2">
            <button
              onClick={() => onPageChange(Math.max(0, page - 1))}
              disabled={page === 0}
              className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-500">{page + 1} / {totalPages}</span>
            <button
              onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
              disabled={page === totalPages - 1}
              className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Step 2: Team picker
function TeamPickerWidget({
  teams,
  loading,
  onSelect,
}: {
  teams: Team[]
  loading: boolean
  onSelect: (teamId: string | null) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
        <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        Loading teams...
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {/* Autonomous / no-team option */}
      <button
        onClick={() => onSelect(null)}
        className="w-full text-left px-3 py-2.5 rounded-lg bg-gray-800/80 border border-gray-600 hover:border-blue-500 hover:bg-gray-700 transition-all text-sm"
      >
        <div className="font-medium text-gray-200">No team (Autonomous)</div>
        <div className="text-xs text-gray-500">Agent works independently, not assigned to any team</div>
      </button>

      {teams.map(team => (
        <button
          key={team.id}
          onClick={() => onSelect(team.id)}
          className="w-full text-left px-3 py-2.5 rounded-lg bg-gray-800/80 border border-gray-600 hover:border-blue-500 hover:bg-gray-700 transition-all text-sm"
        >
          <div className="font-medium text-gray-200">{team.name}</div>
          {team.description && (
            <div className="text-xs text-gray-500">{team.description}</div>
          )}
          <div className="text-xs text-gray-600 mt-0.5">
            {team.agentIds.length} agent{team.agentIds.length !== 1 ? 's' : ''}
          </div>
        </button>
      ))}

      {teams.length === 0 && (
        <p className="text-xs text-gray-500 px-1 pt-1">
          No teams yet — you can create one from the teams panel after setting up this agent.
        </p>
      )}
    </div>
  )
}

// Step 3: Title picker — context-filtered by team assignment
function TitlePickerWidget({
  selectedTeamId,
  onSelect,
}: {
  selectedTeamId: string | null
  onSelect: (title: AgentRole) => void
}) {
  const titles = selectedTeamId ? TEAM_TITLES : AUTONOMOUS_TITLES

  return (
    <div className="space-y-1.5">
      {titles.map((t) => (
        <button
          key={t.value}
          onClick={() => onSelect(t.value)}
          className="w-full text-left px-3 py-2.5 rounded-lg bg-gray-800/80 border border-gray-600 hover:border-blue-500 hover:bg-gray-700 transition-all text-sm"
        >
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold tracking-wider px-1.5 py-0.5 rounded border ${TITLE_COLORS[t.value]}`}>
              {t.label}
            </span>
            {LOCKED_TITLE_PLUGINS[t.value] && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                auto-assigns plugin
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
        </button>
      ))}
    </div>
  )
}

// Step 4: Role plugin picker — only shown for MEMBER and AUTONOMOUS titles
function RolePluginPickerWidget({
  plugins,
  loading,
  selectedTitle,
  onSelect,
}: {
  plugins: RolePlugin[]
  loading: boolean
  selectedTitle: AgentRole
  onSelect: (plugin: RolePlugin | null) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
        <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        Loading plugins...
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {/* Default programmer option — recommended for MEMBER */}
      {selectedTitle === 'member' && (
        <button
          onClick={() => onSelect(null)}
          className="w-full text-left px-3 py-2.5 rounded-lg bg-gray-800/80 border border-blue-500/50 bg-blue-500/5 hover:border-blue-500 hover:bg-blue-500/10 transition-all text-sm"
        >
          <div className="font-medium text-gray-200">Default (Programmer)</div>
          <div className="text-xs text-gray-500">General-purpose AI programmer agent</div>
          <span className="text-xs text-blue-400">Recommended</span>
        </button>
      )}

      {/* Custom plugins with compatible-titles match */}
      {plugins.map(plugin => (
        <button
          key={plugin.name}
          onClick={() => onSelect(plugin)}
          className="w-full text-left px-3 py-2.5 rounded-lg bg-gray-800/80 border border-gray-600 hover:border-blue-500 hover:bg-gray-700 transition-all text-sm"
        >
          <div className="font-medium text-gray-200">{plugin.name}</div>
          {plugin.description && (
            <div className="text-xs text-gray-500">{plugin.description}</div>
          )}
          {plugin.source && (
            <span className="text-xs text-gray-600">{plugin.source}</span>
          )}
        </button>
      ))}

      {/* No custom plugins available (AUTONOMOUS title) */}
      {plugins.length === 0 && selectedTitle !== 'member' && (
        <div className="px-1">
          <p className="text-xs text-gray-500 mb-2">
            No custom plugins available for this title yet.
          </p>
          <button
            onClick={() => onSelect(null)}
            className="w-full text-left px-3 py-2.5 rounded-lg bg-gray-800/80 border border-gray-600 hover:border-blue-500 hover:bg-gray-700 transition-all text-sm"
          >
            <div className="font-medium text-gray-200">No plugin (bare agent)</div>
            <div className="text-xs text-gray-500">Start without a role plugin</div>
          </button>
        </div>
      )}
    </div>
  )
}

// Step 5: Summary + Create
function SummaryCard({
  state,
  onCreate,
}: {
  state: {
    personaName: string
    selectedTeamId: string | null
    selectedTitle: AgentRole
    selectedPlugin: RolePlugin | null
    selectedAvatar: string
    teams: Team[]
  }
  onCreate: () => void
}) {
  const team = state.teams.find(t => t.id === state.selectedTeamId)
  const lockedPlugin = LOCKED_TITLE_PLUGINS[state.selectedTitle]
  const pluginDisplay = lockedPlugin
    ? lockedPlugin
    : (state.selectedPlugin ? state.selectedPlugin.name : 'Default (Programmer)')

  return (
    <div className="rounded-xl bg-gray-800/60 border border-gray-700 p-4 space-y-2.5">
      {/* Avatar + name preview */}
      <div className="flex items-center gap-3 pb-2 border-b border-gray-700/50">
        <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-gray-600 flex-shrink-0">
          {state.selectedAvatar ? (
            <Image
              src={state.selectedAvatar}
              alt=""
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-400 text-lg font-bold">
              {state.personaName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <div className="font-semibold text-gray-100">{state.personaName}</div>
          <span
            className={`text-xs font-bold tracking-wider px-1.5 py-0.5 rounded border ${TITLE_COLORS[state.selectedTitle]}`}
          >
            {state.selectedTitle.toUpperCase()}
          </span>
        </div>
      </div>

      <SummaryRow label="Team" value={team ? team.name : 'Autonomous (no team)'} />
      <SummaryRow label="Role Plugin" value={pluginDisplay} />

      <button
        onClick={onCreate}
        className="w-full mt-3 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-lg shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all duration-300 transform hover:scale-[1.02] text-sm"
      >
        Create Agent!
      </button>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-200 font-medium">{value}</span>
    </div>
  )
}

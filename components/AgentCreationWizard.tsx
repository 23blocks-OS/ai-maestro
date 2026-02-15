'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowLeft, ExternalLink, ChevronRight } from 'lucide-react'
import CreateAgentAnimation, { getPreviewAvatarUrl } from './CreateAgentAnimation'
import { useHosts } from '@/hooks/useHosts'
import type { Host } from '@/types/host'

// --- Types ---

type WizardStep = 'host' | 'runtime' | 'program' | 'name' | 'directory' | 'summary' | 'creating' | 'done'

interface ChatMessage {
  id: string
  role: 'robot' | 'user'
  text: string
  step: WizardStep
  widget?: 'buttons' | 'program-grid' | 'text-input' | 'directory-input' | 'summary'
  widgetData?: Record<string, unknown>
}

// --- Constants ---

const PROGRAM_OPTIONS = [
  { value: 'claude-code', label: 'Claude Code', desc: "Anthropic's AI coding assistant" },
  { value: 'codex', label: 'Codex CLI', desc: "OpenAI's coding tool" },
  { value: 'aider', label: 'Aider', desc: 'AI pair programming' },
  { value: 'cursor', label: 'Cursor', desc: 'AI-first code editor' },
  { value: 'gemini', label: 'Gemini CLI', desc: "Google's AI assistant" },
  { value: 'opencode', label: 'OpenCode', desc: 'Open-source AI coding' },
  { value: 'terminal', label: 'Terminal Only', desc: 'Plain shell, no AI' },
]

const FEMALE_ALIASES = [
  'MarIA', 'SofIA', 'LucIA', 'JulIA', 'NatalIA', 'OlivIA', 'VictorIA', 'ValerIA',
  'NovaIA', 'StellaIA', 'AuroraIA', 'CelestIA', 'HarmonIA', 'SerenIA', 'DataIA',
]
const MALE_ALIASES = [
  'LunAI', 'NovAI', 'AriAI', 'ZarAI', 'KAI', 'SkyAI', 'MaxAI', 'LeoAI',
  'MirAI', 'EchoAI', 'ZenAI', 'NeoAI', 'PixAI', 'BytAI', 'CodeAI',
  'AtlAI', 'OrionAI', 'PhoenixAI', 'TitanAI', 'VegAI', 'CosmAI',
]

function getRandomAlias(agentName: string): string {
  let hash = 0
  for (let i = 0; i < agentName.length; i++) {
    const char = agentName.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  const isMale = (Math.abs(hash >> 8) % 2 === 0)
  const aliases = isMale ? MALE_ALIASES : FEMALE_ALIASES
  return aliases[Math.abs(hash) % aliases.length]
}

// --- Step logic ---

const STEP_ORDER: WizardStep[] = ['host', 'runtime', 'program', 'name', 'directory', 'summary']

function getVisibleStepCount(hosts: Host[], hostId: string): number {
  let count = STEP_ORDER.length
  if (hosts.length <= 1) count--
  const selectedHost = hosts.find(h => h.id === hostId)
  if (!selectedHost?.capabilities?.docker) count--
  return count
}

function getStepNumber(step: WizardStep, hosts: Host[], hostId: string): number {
  let n = 0
  for (const s of STEP_ORDER) {
    if (s === 'host' && hosts.length <= 1) continue
    if (s === 'runtime') {
      const selectedHost = hosts.find(h => h.id === hostId)
      if (!selectedHost?.capabilities?.docker) continue
    }
    n++
    if (s === step) return n
  }
  return n
}

let msgCounter = 0
function makeMsg(role: 'robot' | 'user', text: string, step: WizardStep, widget?: ChatMessage['widget'], widgetData?: Record<string, unknown>): ChatMessage {
  return { id: `msg-${++msgCounter}-${Math.random().toString(36).slice(2, 6)}`, role, text, step, widget, widgetData }
}

function robotQuestion(step: WizardStep): ChatMessage {
  switch (step) {
    case 'host':
      return makeMsg('robot', 'Where should this agent live?', step, 'buttons', {
        options: [
          { value: '__local__', label: 'This computer' },
          { value: '__remote__', label: 'Another host on the network' },
        ]
      })
    case 'runtime':
      return makeMsg('robot', 'How should this agent run?', step, 'buttons', {
        options: [
          { value: 'tmux', label: 'Direct access' },
          { value: 'docker', label: 'Private container (Docker)' },
        ]
      })
    case 'program':
      return makeMsg('robot', 'What AI tool should power this agent?', step, 'program-grid')
    case 'name':
      return makeMsg('robot', "What should we name this agent?", step, 'text-input')
    case 'directory':
      return makeMsg('robot', 'Where should this agent work?', step, 'directory-input')
    case 'summary':
      return makeMsg('robot', "Here's your new agent! Ready to bring it to life?", step, 'summary')
    default:
      return makeMsg('robot', '', step)
  }
}

// --- Props ---

interface AgentCreationWizardProps {
  onClose: () => void
  onComplete: () => void
  onSwitchToAdvanced: () => void
}

// --- Component ---

export default function AgentCreationWizard({ onClose, onComplete, onSwitchToAdvanced }: AgentCreationWizardProps) {
  const { hosts, loading: hostsLoading } = useHosts()
  const [robotAvatarIndex] = useState(() => Math.floor(Math.random() * 45))
  const robotAvatarUrl = `/avatars/robots_${robotAvatarIndex.toString().padStart(2, '0')}.png`

  const chatEndRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [step, setStep] = useState<WizardStep>('host')
  const [hostId, setHostId] = useState('')
  const [runtime, setRuntime] = useState<'tmux' | 'docker'>('tmux')
  const [program, setProgram] = useState('claude-code')
  const [agentName, setAgentName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [showHostCards, setShowHostCards] = useState(false)

  // Creation animation state
  const [isCreating, setIsCreating] = useState(false)
  const [animationPhase, setAnimationPhase] = useState<'preparing' | 'creating' | 'ready' | 'error'>('preparing')
  const [animationProgress, setAnimationProgress] = useState(0)
  const [creationSuccess, setCreationSuccess] = useState(false)
  const [showLetsGo, setShowLetsGo] = useState(false)
  const [creationError, setCreationError] = useState('')

  // Input state
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState('')
  const [dirInput, setDirInput] = useState('')

  // Only the latest step gets an interactive widget
  const [activeWidgetStep, setActiveWidgetStep] = useState<WizardStep | null>(null)

  // Ref to block goBack during the 400ms transition between steps
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup transition timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
    }
  }, [])

  // Initialize first question when hosts load
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (hostsLoading || initialized) return
    setInitialized(true)

    let firstStep: WizardStep = 'host'
    let initHostId = ''

    if (hosts.length <= 1) {
      const selfHost = hosts.find(h => h.isSelf) || hosts[0]
      if (selfHost) initHostId = selfHost.id
      setHostId(initHostId)

      const selectedHost = hosts.find(h => h.id === initHostId)
      if (!selectedHost?.capabilities?.docker) {
        firstStep = 'program'
        setRuntime('tmux')
      } else {
        firstStep = 'runtime'
      }
    }

    setStep(firstStep)
    setActiveWidgetStep(firstStep)
    setTimeout(() => {
      setMessages([
        makeMsg('robot', "Hey! I'm here to help you set up a new agent.", firstStep),
        robotQuestion(firstStep),
      ])
    }, 200)
  }, [hostsLoading, initialized, hosts])

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

    // Clear any pending transition before scheduling a new one
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
    // Block if a transition is in progress
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }

    const idx = STEP_ORDER.indexOf(step)
    if (idx <= 0) return

    let prevStep: WizardStep | null = null
    for (let i = idx - 1; i >= 0; i--) {
      const s = STEP_ORDER[i]
      if (s === 'host' && hosts.length <= 1) continue
      if (s === 'runtime') {
        const selectedHost = hosts.find(h => h.id === hostId)
        if (!selectedHost?.capabilities?.docker) continue
      }
      prevStep = s
      break
    }
    if (!prevStep) return

    // Remove current step messages + previous step's user answer
    const prev = prevStep
    setMessages(msgs => msgs.filter(m => m.step !== step && !(m.step === prev && m.role === 'user')))
    setStep(prevStep)
    setActiveWidgetStep(prevStep)
    setShowHostCards(false)
  }, [step, hosts, hostId])

  // --- Handlers ---

  const handleHostLocal = useCallback(() => {
    const selfHost = hosts.find(h => h.isSelf) || hosts[0]
    if (selfHost) setHostId(selfHost.id)
    const hasDocker = selfHost ? (hosts.find(h => h.id === selfHost.id)?.capabilities?.docker ?? false) : false
    if (!hasDocker) {
      setRuntime('tmux')
      advance('This computer', 'program')
    } else {
      advance('This computer', 'runtime')
    }
  }, [hosts, advance])

  const handleHostRemote = useCallback(() => {
    setShowHostCards(true)
  }, [])

  const handleHostSelect = useCallback((host: Host) => {
    setHostId(host.id)
    setShowHostCards(false)
    const hasDocker = host.capabilities?.docker ?? false
    if (!hasDocker) {
      setRuntime('tmux')
      advance(host.name || host.id, 'program')
    } else {
      advance(host.name || host.id, 'runtime')
    }
  }, [advance])

  const handleRuntime = useCallback((rt: 'tmux' | 'docker', label: string) => {
    setRuntime(rt)
    advance(label, 'program')
  }, [advance])

  const handleProgram = useCallback((prog: string, label: string) => {
    setProgram(prog)
    advance(label, 'name')
  }, [advance])

  const handleNameSubmit = useCallback(() => {
    const trimmed = nameInput.trim()
    if (!trimmed) return
    if (!/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
      setNameError('Only letters, numbers, dashes, and underscores')
      return
    }
    setAgentName(trimmed)
    setNameError('')
    advance(trimmed, 'directory')
  }, [nameInput, advance])

  const handleDirectorySubmit = useCallback(() => {
    const trimmed = dirInput.trim()
    setWorkingDirectory(trimmed)
    advance(trimmed || 'No directory (default home)', 'summary')
  }, [dirInput, advance])

  const handleDirectorySkip = useCallback(() => {
    setWorkingDirectory('')
    advance('Skipped', 'summary')
  }, [advance])

  // --- Create agent ---
  const handleCreate = useCallback(async () => {
    setIsCreating(true)
    setStep('creating')
    setMessages(prev => [...prev, makeMsg('user', "Let's do it!", 'summary')])

    const personaName = getRandomAlias(agentName)
    const avatarUrl = getPreviewAvatarUrl(agentName)

    try {
      if (runtime === 'docker') {
        const response = await fetch('/api/agents/docker/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: agentName,
            workingDirectory: workingDirectory || undefined,
            hostId: hostId || undefined,
            program: program === 'claude-code' ? 'claude' : program,
            label: personaName,
            avatar: avatarUrl,
          }),
        })
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to create Docker agent')
        }
      } else {
        const response = await fetch('/api/sessions/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: agentName,
            workingDirectory: workingDirectory || undefined,
            hostId: hostId || undefined,
            label: personaName,
            avatar: avatarUrl,
            program,
          }),
        })
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to create agent')
        }
      }
      setCreationSuccess(true)
    } catch (err) {
      setCreationError(err instanceof Error ? err.message : 'Failed to create agent')
      setAnimationPhase('error')
      setIsCreating(false)
    }
  }, [agentName, workingDirectory, hostId, runtime, program])

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
  const stepNumber = getStepNumber(step, hosts, hostId)
  const totalSteps = getVisibleStepCount(hosts, hostId)
  const canGoBack = step !== 'creating' && step !== 'done' && (() => {
    const idx = STEP_ORDER.indexOf(step)
    if (idx <= 0) return false
    for (let i = idx - 1; i >= 0; i--) {
      const s = STEP_ORDER[i]
      if (s === 'host' && hosts.length <= 1) continue
      if (s === 'runtime') {
        const selectedHost = hosts.find(h => h.id === hostId)
        if (!selectedHost?.capabilities?.docker) continue
      }
      return true
    }
    return false
  })()

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
          <div className="flex items-center gap-3">
            {!isCreating && (
              <button
                onClick={onSwitchToAdvanced}
                className="text-xs text-gray-400 hover:text-blue-400 transition-colors flex items-center gap-1"
              >
                Advanced
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: Left (robot) + Right (chat) */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel - Robot avatar (hidden on mobile) */}
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
              <img
                src={robotAvatarUrl}
                alt="Robot assistant"
                className="w-44 h-44 rounded-full object-cover ring-2 ring-blue-500/40 relative z-10"
              />
            </div>
          </div>

          {/* Right panel - Chat */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {hostsLoading ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Preparing wizard...</p>
                </div>
              </div>
            ) : isCreating ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6">
                <div className="text-center mb-2">
                  <h3 className="text-lg font-semibold text-gray-100">
                    {animationPhase === 'ready' ? 'Your Agent is Ready!' : 'Creating Your Agent'}
                  </h3>
                  {animationPhase !== 'ready' && <p className="text-sm text-gray-400">{agentName}</p>}
                </div>
                <CreateAgentAnimation
                  phase={animationPhase}
                  agentName={agentName}
                  agentAlias={getRandomAlias(agentName)}
                  avatarUrl={getPreviewAvatarUrl(agentName)}
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
                      hosts={hosts}
                      showHostCards={showHostCards}
                      state={{ hostId, runtime, program, agentName, workingDirectory }}
                      nameInput={nameInput}
                      nameError={nameError}
                      dirInput={dirInput}
                      onNameChange={setNameInput}
                      onNameError={setNameError}
                      onDirChange={setDirInput}
                      onHostLocal={handleHostLocal}
                      onHostRemote={handleHostRemote}
                      onHostSelect={handleHostSelect}
                      onRuntime={handleRuntime}
                      onProgram={handleProgram}
                      onNameSubmit={handleNameSubmit}
                      onDirectorySubmit={handleDirectorySubmit}
                      onDirectorySkip={handleDirectorySkip}
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

function ChatBubble({
  message,
  robotAvatarUrl,
  isActiveWidget,
  hosts,
  showHostCards,
  state,
  nameInput,
  nameError,
  dirInput,
  onNameChange,
  onNameError,
  onDirChange,
  onHostLocal,
  onHostRemote,
  onHostSelect,
  onRuntime,
  onProgram,
  onNameSubmit,
  onDirectorySubmit,
  onDirectorySkip,
  onCreate,
}: {
  message: ChatMessage
  robotAvatarUrl: string
  isActiveWidget: boolean
  hosts: Host[]
  showHostCards: boolean
  state: { hostId: string; runtime: string; program: string; agentName: string; workingDirectory: string }
  nameInput: string
  nameError: string
  dirInput: string
  onNameChange: (v: string) => void
  onNameError: (v: string) => void
  onDirChange: (v: string) => void
  onHostLocal: () => void
  onHostRemote: () => void
  onHostSelect: (host: Host) => void
  onRuntime: (rt: 'tmux' | 'docker', label: string) => void
  onProgram: (prog: string, label: string) => void
  onNameSubmit: () => void
  onDirectorySubmit: () => void
  onDirectorySkip: () => void
  onCreate: () => void
}) {
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
          <img src={robotAvatarUrl} alt="" className="w-7 h-7 rounded-full object-cover ring-1 ring-gray-700" />
        </div>
      )}
      <div className="max-w-[85%]">
        <div
          className={`rounded-xl px-3.5 py-2.5 text-sm ${
            isRobot
              ? 'bg-gray-800 text-gray-200 rounded-tl-sm'
              : 'bg-blue-600 text-white rounded-tr-sm'
          }`}
        >
          {message.text}
        </div>

        {/* Widget area (only for active robot messages) */}
        {isRobot && message.widget && isActiveWidget && (
          <div className="mt-2">
            {message.widget === 'buttons' && (
              <ButtonsWidget
                options={(message.widgetData?.options as Array<{ value: string; label: string }>) || []}
                onSelect={(value, label) => {
                  if (message.step === 'host') {
                    if (value === '__local__') onHostLocal()
                    else onHostRemote()
                  } else if (message.step === 'runtime') {
                    onRuntime(value as 'tmux' | 'docker', label)
                  }
                }}
              />
            )}

            {message.widget === 'buttons' && message.step === 'host' && showHostCards && (
              <div className="mt-2 space-y-1.5">
                {hosts.filter(h => !h.isSelf).map(host => (
                  <button
                    key={host.id}
                    onClick={() => onHostSelect(host)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700 hover:border-blue-500/50 hover:bg-gray-800 transition-all text-sm"
                  >
                    <div className="font-medium text-gray-200">{host.name || host.id}</div>
                    <div className="text-xs text-gray-500">{host.url}</div>
                  </button>
                ))}
              </div>
            )}

            {message.widget === 'program-grid' && (
              <ProgramGrid onSelect={onProgram} />
            )}

            {message.widget === 'text-input' && (
              <TextInputWidget
                value={nameInput}
                onChange={(v) => { onNameChange(v); onNameError('') }}
                onSubmit={onNameSubmit}
                placeholder="23blocks-api-myagent"
                error={nameError}
                hint="Letters, numbers, dashes, and underscores only"
              />
            )}

            {message.widget === 'directory-input' && (
              <DirectoryInputWidget
                value={dirInput}
                onChange={onDirChange}
                onSubmit={onDirectorySubmit}
                onSkip={onDirectorySkip}
                placeholder="~/projects/my-app"
              />
            )}

            {message.widget === 'summary' && (
              <SummaryCard
                hosts={hosts}
                hostId={state.hostId}
                runtime={state.runtime}
                program={state.program}
                agentName={state.agentName}
                workingDirectory={state.workingDirectory}
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

function ButtonsWidget({ options, onSelect }: { options: Array<{ value: string; label: string }>; onSelect: (value: string, label: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value, opt.label)}
          className="px-4 py-2 rounded-lg bg-gray-800/80 border border-gray-600 text-sm text-gray-200 hover:border-blue-500 hover:bg-gray-700 transition-all"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ProgramGrid({ onSelect }: { onSelect: (value: string, label: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PROGRAM_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value, opt.label)}
          className="px-3 py-2.5 rounded-lg bg-gray-800/80 border border-gray-600 text-left hover:border-blue-500 hover:bg-gray-700 transition-all group"
        >
          <div className="text-sm font-medium text-gray-200 group-hover:text-blue-300">{opt.label}</div>
          <div className="text-xs text-gray-500">{opt.desc}</div>
        </button>
      ))}
    </div>
  )
}

function TextInputWidget({
  value,
  onChange,
  onSubmit,
  placeholder,
  error,
  hint,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder: string
  error: string
  hint?: string
}) {
  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
          placeholder={placeholder}
          autoFocus
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={onSubmit}
          disabled={!value.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

function DirectoryInputWidget({
  value,
  onChange,
  onSubmit,
  onSkip,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onSkip: () => void
  placeholder: string
}) {
  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
          placeholder={placeholder}
          autoFocus
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={onSubmit}
          disabled={!value.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <button
        onClick={onSkip}
        className="mt-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        Skip (use default home directory)
      </button>
    </div>
  )
}

function SummaryCard({
  hosts,
  hostId,
  runtime,
  program,
  agentName,
  workingDirectory,
  onCreate,
}: {
  hosts: Host[]
  hostId: string
  runtime: string
  program: string
  agentName: string
  workingDirectory: string
  onCreate: () => void
}) {
  const host = hosts.find(h => h.id === hostId)
  const programLabel = PROGRAM_OPTIONS.find(p => p.value === program)?.label || program

  return (
    <div className="rounded-xl bg-gray-800/60 border border-gray-700 p-4 space-y-2.5">
      <SummaryRow label="Name" value={agentName} />
      <SummaryRow label="Host" value={host?.isSelf ? 'This computer' : (host?.name || hostId || 'Local')} />
      <SummaryRow label="Runtime" value={runtime === 'docker' ? 'Docker container' : 'Direct (tmux)'} />
      <SummaryRow label="Program" value={programLabel} />
      <SummaryRow label="Directory" value={workingDirectory || '(default home)'} />

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

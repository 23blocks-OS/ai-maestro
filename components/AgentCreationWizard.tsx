'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowLeft, ExternalLink, ChevronRight } from 'lucide-react'
import CreateAgentAnimation, { getPreviewAvatarUrl } from './CreateAgentAnimation'
import { useHosts } from '@/hooks/useHosts'
import type { Host } from '@/types/host'
import { getRandomAlias } from '@/lib/agent-utils'

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

interface DockerMount {
  hostPath: string
  containerPath: string
  readOnly: boolean
}

interface DockerEnvVar {
  key: string
  value: string
}

interface DockerState {
  showDockerAdvanced: boolean
  setShowDockerAdvanced: (v: boolean) => void
  dockerCpus: number
  setDockerCpus: (v: number) => void
  dockerMemory: string
  setDockerMemory: (v: string) => void
  dockerMounts: DockerMount[]
  setDockerMounts: (v: DockerMount[]) => void
  dockerEnvVars: DockerEnvVar[]
  setDockerEnvVars: (v: DockerEnvVar[]) => void
  dockerOnWake: string
  setDockerOnWake: (v: string) => void
  dockerOnHibernate: string
  setDockerOnHibernate: (v: string) => void
  dockerGithubToken: string
  setDockerGithubToken: (v: string) => void
  dockerYolo: boolean
  setDockerYolo: (v: boolean) => void
  dockerMeshAware: boolean
  setDockerMeshAware: (v: boolean) => void
  dockerAutoRemove: boolean
  setDockerAutoRemove: (v: boolean) => void
}

interface CloudState {
  cloudEcrImageOverride: string
  setCloudEcrImageOverride: (v: string) => void
  cloudDomain: string
  setCloudDomain: (v: string) => void
  cloudSslEmail: string
  setCloudSslEmail: (v: string) => void
  cloudKeyName: string
  setCloudKeyName: (v: string) => void
  cloudAwsRegion: string
  setCloudAwsRegion: (v: string) => void
  cloudInstanceType: string
  setCloudInstanceType: (v: string) => void
  cloudEcsCpu: number
  setCloudEcsCpu: (v: number) => void
  cloudEcsMemory: number
  setCloudEcsMemory: (v: number) => void
  cloudAnthropicKey: string
  setCloudAnthropicKey: (v: string) => void
  cloudGithubToken: string
  setCloudGithubToken: (v: string) => void
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

// --- Step logic ---

const STEP_ORDER: WizardStep[] = ['host', 'runtime', 'program', 'name', 'directory', 'summary']

function hasRuntimeChoice(host: Host | undefined): boolean {
  return !!(host?.capabilities?.docker || host?.capabilities?.cloud?.aws)
}

function shouldSkipStep(s: WizardStep, hosts: Host[], hostId: string, runtime: string): boolean {
  if (s === 'host' && hosts.length <= 1) return true
  if (s === 'runtime') {
    const selectedHost = hosts.find(h => h.id === hostId)
    if (!hasRuntimeChoice(selectedHost)) return true
  }
  if (s === 'directory' && (runtime === 'ec2' || runtime === 'ecs')) return true
  return false
}

function getVisibleStepCount(hosts: Host[], hostId: string, runtime: string): number {
  return STEP_ORDER.filter(s => !shouldSkipStep(s, hosts, hostId, runtime)).length
}

function getStepNumber(step: WizardStep, hosts: Host[], hostId: string, runtime: string): number {
  let n = 0
  for (const s of STEP_ORDER) {
    if (shouldSkipStep(s, hosts, hostId, runtime)) continue
    n++
    if (s === step) return n
  }
  return n
}

let msgCounter = 0
function makeMsg(role: 'robot' | 'user', text: string, step: WizardStep, widget?: ChatMessage['widget'], widgetData?: Record<string, unknown>): ChatMessage {
  return { id: `msg-${++msgCounter}-${Math.random().toString(36).slice(2, 6)}`, role, text, step, widget, widgetData }
}

function robotQuestion(step: WizardStep, host?: Host): ChatMessage {
  switch (step) {
    case 'host':
      return makeMsg('robot', 'Where should this agent live?', step, 'buttons', {
        options: [
          { value: '__local__', label: 'This computer' },
          { value: '__remote__', label: 'Another host on the network' },
        ]
      })
    case 'runtime': {
      const options: { value: string; label: string }[] = [
        { value: 'tmux', label: 'Direct access' },
      ]
      if (host?.capabilities?.docker) {
        options.push({ value: 'docker', label: 'Private container (Docker)' })
      }
      if (host?.capabilities?.cloud?.aws) {
        options.push({ value: 'ec2', label: 'AWS EC2 (dedicated instance)' })
        options.push({ value: 'ecs', label: 'AWS ECS Fargate (serverless)' })
      }
      return makeMsg('robot', 'How should this agent run?', step, 'buttons', { options })
    }
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
  const [runtime, setRuntime] = useState<'tmux' | 'docker' | 'ec2' | 'ecs'>('tmux')
  const [program, setProgram] = useState('claude-code')
  const [agentName, setAgentName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [showHostCards, setShowHostCards] = useState(false)

  // Docker advanced options state
  const [showDockerAdvanced, setShowDockerAdvanced] = useState(false)
  const [dockerCpus, setDockerCpus] = useState(2)
  const [dockerMemory, setDockerMemory] = useState('4g')
  const [dockerMounts, setDockerMounts] = useState<{hostPath: string, containerPath: string, readOnly: boolean}[]>([])
  const [dockerEnvVars, setDockerEnvVars] = useState<{key: string, value: string}[]>([])
  const [dockerOnWake, setDockerOnWake] = useState('')
  const [dockerOnHibernate, setDockerOnHibernate] = useState('')
  const [dockerGithubToken, setDockerGithubToken] = useState('')
  const [dockerYolo, setDockerYolo] = useState(false)
  const [dockerMeshAware, setDockerMeshAware] = useState(false)
  const [dockerAutoRemove, setDockerAutoRemove] = useState(false)

  // Cloud state (EC2 / ECS)
  const [cloudEcrImageOverride, setCloudEcrImageOverride] = useState('')
  const [cloudDomain, setCloudDomain] = useState('')
  const [cloudSslEmail, setCloudSslEmail] = useState('')
  const [cloudKeyName, setCloudKeyName] = useState('')
  const [cloudAwsRegion, setCloudAwsRegion] = useState('us-east-1')
  const [cloudInstanceType, setCloudInstanceType] = useState('t4g.small')
  const [cloudEcsCpu, setCloudEcsCpu] = useState(512)
  const [cloudEcsMemory, setCloudEcsMemory] = useState(1024)
  const [cloudAnthropicKey, setCloudAnthropicKey] = useState('')
  const [cloudGithubToken, setCloudGithubToken] = useState('')

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
      if (!hasRuntimeChoice(selectedHost)) {
        firstStep = 'program'
        setRuntime('tmux')
      } else {
        firstStep = 'runtime'
      }
    }

    const initHost = hosts.find(h => h.id === initHostId)
    setStep(firstStep)
    setActiveWidgetStep(firstStep)
    setTimeout(() => {
      setMessages([
        makeMsg('robot', "Hey! I'm here to help you set up a new agent.", firstStep),
        robotQuestion(firstStep, initHost),
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

    const selectedHost = hosts.find(h => h.id === hostId)
    // Clear any pending transition before scheduling a new one
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
    transitionTimerRef.current = setTimeout(() => {
      transitionTimerRef.current = null
      setStep(nextStep)
      setActiveWidgetStep(nextStep)
      setMessages(prev => [...prev, robotQuestion(nextStep, selectedHost)])
    }, 400)
  }, [step, hosts, hostId])

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
      if (shouldSkipStep(s, hosts, hostId, runtime)) continue
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
  }, [step, hosts, hostId, runtime])

  // --- Handlers ---

  const handleHostLocal = useCallback(() => {
    const selfHost = hosts.find(h => h.isSelf) || hosts[0]
    if (selfHost) setHostId(selfHost.id)
    if (!hasRuntimeChoice(selfHost)) {
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
    if (!hasRuntimeChoice(host)) {
      setRuntime('tmux')
      advance(host.name || host.id, 'program')
    } else {
      advance(host.name || host.id, 'runtime')
    }
  }, [advance])

  const handleRuntime = useCallback((rt: 'tmux' | 'docker' | 'ec2' | 'ecs', label: string) => {
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
    // Cloud agents don't need a working directory (it's /workspace on the VM)
    if (runtime === 'ec2' || runtime === 'ecs') {
      setWorkingDirectory('')
      advance(trimmed, 'summary')
    } else {
      advance(trimmed, 'directory')
    }
  }, [nameInput, runtime, advance])

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
      if (runtime === 'ec2' || runtime === 'ecs') {
        // Cloud payload (EC2 / ECS Fargate)
        const cloudPayload: Record<string, unknown> = {
          name: agentName,
          provider: runtime,
          label: personaName,
          avatar: avatarUrl,
          program: program === 'claude-code' ? 'claude' : program,
        }
        // ECS only: include ECR image override if provided (auto-built if omitted)
        if (runtime === 'ecs' && cloudEcrImageOverride) cloudPayload.ecrImageUrl = cloudEcrImageOverride
        if (cloudAwsRegion !== 'us-east-1') cloudPayload.awsRegion = cloudAwsRegion
        if (cloudDomain) cloudPayload.domainName = cloudDomain
        if (runtime === 'ec2') {
          if (cloudSslEmail) cloudPayload.sslEmail = cloudSslEmail
          if (cloudKeyName) cloudPayload.keyName = cloudKeyName
          if (cloudInstanceType !== 't4g.small') cloudPayload.instanceType = cloudInstanceType
        }
        if (runtime === 'ecs') {
          if (cloudEcsCpu !== 512) cloudPayload.cpu = cloudEcsCpu
          if (cloudEcsMemory !== 1024) cloudPayload.memory = cloudEcsMemory
        }
        if (cloudAnthropicKey) cloudPayload.anthropicKey = cloudAnthropicKey
        if (cloudGithubToken) cloudPayload.githubToken = cloudGithubToken

        const response = await fetch('/api/agents/cloud/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cloudPayload),
        })
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.message || data.error || 'Failed to create cloud agent')
        }
      } else if (runtime === 'docker') {
        // Build Docker payload with advanced options
        const dockerPayload: Record<string, unknown> = {
          name: agentName,
          workingDirectory: workingDirectory || undefined,
          hostId: hostId || undefined,
          program: program === 'claude-code' ? 'claude' : program,
          label: personaName,
          avatar: avatarUrl,
        }

        if (showDockerAdvanced) {
          if (dockerCpus !== 2) dockerPayload.cpus = dockerCpus
          if (dockerMemory !== '4g') dockerPayload.memory = dockerMemory
          if (dockerMounts.length > 0) dockerPayload.mounts = dockerMounts
          if (dockerEnvVars.length > 0) {
            const extraEnv: Record<string, string> = {}
            dockerEnvVars.forEach(e => { if (e.key && e.value) extraEnv[e.key] = e.value })
            if (Object.keys(extraEnv).length > 0) dockerPayload.extraEnv = extraEnv
          }
          if (dockerOnWake || dockerOnHibernate) {
            const hooks: Record<string, string> = {}
            if (dockerOnWake) hooks['on-wake'] = dockerOnWake
            if (dockerOnHibernate) hooks['on-hibernate'] = dockerOnHibernate
            dockerPayload.hooks = hooks
          }
          if (dockerGithubToken) dockerPayload.githubToken = dockerGithubToken
          if (dockerYolo) dockerPayload.yolo = true
          if (dockerMeshAware) dockerPayload.meshAware = true
          if (dockerAutoRemove) dockerPayload.autoRemove = true
        }

        const response = await fetch('/api/agents/docker/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dockerPayload),
        })
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.message || data.error || 'Failed to create Docker agent')
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
          throw new Error(data.message || data.error || 'Failed to create agent')
        }
      }
      setCreationSuccess(true)
    } catch (err) {
      setCreationError(err instanceof Error ? err.message : 'Failed to create agent')
      setAnimationPhase('error')
      setIsCreating(false)
    }
  }, [agentName, workingDirectory, hostId, runtime, program, cloudEcrImageOverride, cloudDomain, cloudSslEmail, cloudKeyName, cloudAwsRegion, cloudInstanceType, cloudEcsCpu, cloudEcsMemory, cloudAnthropicKey, cloudGithubToken])

  // Animation timer sequence — fast fixed for local, slow open-ended for cloud
  const isCloudRuntime = runtime === 'ec2' || runtime === 'ecs'

  useEffect(() => {
    if (!isCreating) return
    setAnimationPhase('preparing')
    setAnimationProgress(5)

    if (!isCloudRuntime) {
      // Local/Docker: fixed 6.5s animation
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
    } else {
      // Cloud: open-ended — slowly crawl to 85% over ~5 min, then wait for success
      const timers = [
        setTimeout(() => setAnimationProgress(8), 2000),
        setTimeout(() => { setAnimationPhase('creating'); setAnimationProgress(15) }, 5000),
        setTimeout(() => setAnimationProgress(22), 15000),
        setTimeout(() => setAnimationProgress(30), 30000),
        setTimeout(() => setAnimationProgress(40), 60000),
        setTimeout(() => setAnimationProgress(50), 90000),
        setTimeout(() => setAnimationProgress(60), 120000),
        setTimeout(() => setAnimationProgress(70), 180000),
        setTimeout(() => setAnimationProgress(78), 240000),
        setTimeout(() => setAnimationProgress(85), 300000),
      ]
      return () => timers.forEach(clearTimeout)
    }
  }, [isCreating, creationSuccess, isCloudRuntime])

  // When creation succeeds, snap to 100% and show "Let's Go"
  useEffect(() => {
    if (creationSuccess && animationPhase !== 'ready') {
      setAnimationPhase('ready')
      setAnimationProgress(100)
      const timer = setTimeout(() => setShowLetsGo(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [creationSuccess, animationPhase])

  // --- Computed ---
  const stepNumber = getStepNumber(step, hosts, hostId, runtime)
  const totalSteps = getVisibleStepCount(hosts, hostId, runtime)
  const canGoBack = step !== 'creating' && step !== 'done' && (() => {
    const idx = STEP_ORDER.indexOf(step)
    if (idx <= 0) return false
    for (let i = idx - 1; i >= 0; i--) {
      const s = STEP_ORDER[i]
      if (shouldSkipStep(s, hosts, hostId, runtime)) continue
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
                      state={{ hostId, runtime, program, agentName, workingDirectory, dockerState: {
                        showDockerAdvanced, setShowDockerAdvanced,
                        dockerCpus, setDockerCpus, dockerMemory, setDockerMemory,
                        dockerMounts, setDockerMounts, dockerEnvVars, setDockerEnvVars,
                        dockerOnWake, setDockerOnWake, dockerOnHibernate, setDockerOnHibernate,
                        dockerGithubToken, setDockerGithubToken,
                        dockerYolo, setDockerYolo, dockerMeshAware, setDockerMeshAware,
                        dockerAutoRemove, setDockerAutoRemove,
                      }, cloudState: {
                        cloudEcrImageOverride, setCloudEcrImageOverride,
                        cloudDomain, setCloudDomain,
                        cloudSslEmail, setCloudSslEmail,
                        cloudKeyName, setCloudKeyName,
                        cloudAwsRegion, setCloudAwsRegion,
                        cloudInstanceType, setCloudInstanceType,
                        cloudEcsCpu, setCloudEcsCpu,
                        cloudEcsMemory, setCloudEcsMemory,
                        cloudAnthropicKey, setCloudAnthropicKey,
                        cloudGithubToken, setCloudGithubToken,
                      }}}
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
  state: { hostId: string; runtime: string; program: string; agentName: string; workingDirectory: string; dockerState?: DockerState; cloudState?: CloudState }
  nameInput: string
  nameError: string
  dirInput: string
  onNameChange: (v: string) => void
  onNameError: (v: string) => void
  onDirChange: (v: string) => void
  onHostLocal: () => void
  onHostRemote: () => void
  onHostSelect: (host: Host) => void
  onRuntime: (rt: 'tmux' | 'docker' | 'ec2' | 'ecs', label: string) => void
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
                    onRuntime(value as 'tmux' | 'docker' | 'ec2' | 'ecs', label)
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
                dockerState={state.runtime === 'docker' ? state.dockerState : undefined}
                cloudState={(state.runtime === 'ec2' || state.runtime === 'ecs') ? state.cloudState : undefined}
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
  dockerState,
  cloudState,
}: {
  hosts: Host[]
  hostId: string
  runtime: string
  program: string
  agentName: string
  workingDirectory: string
  onCreate: () => void
  dockerState?: DockerState
  cloudState?: CloudState
}) {
  const host = hosts.find(h => h.id === hostId)
  const programLabel = PROGRAM_OPTIONS.find(p => p.value === program)?.label || program
  const [showCloudOptions, setShowCloudOptions] = useState(false)

  const runtimeLabel = {
    tmux: 'Direct (tmux)',
    docker: 'Docker container',
    ec2: 'AWS EC2 (dedicated)',
    ecs: 'AWS ECS Fargate (serverless)',
  }[runtime] || runtime

  return (
    <div className="rounded-xl bg-gray-800/60 border border-gray-700 p-4 space-y-2.5">
      <SummaryRow label="Name" value={agentName} />
      <SummaryRow label="Host" value={host?.isSelf ? 'This computer' : (host?.name || hostId || 'Local')} />
      <SummaryRow label="Runtime" value={runtimeLabel} />
      <SummaryRow label="Program" value={programLabel} />
      {runtime !== 'ec2' && runtime !== 'ecs' && (
        <SummaryRow label="Directory" value={workingDirectory || '(default home)'} />
      )}

      {/* Docker advanced options — collapsible */}
      {runtime === 'docker' && dockerState && (
        <div className="border-t border-gray-700/50 pt-2">
          <button
            onClick={() => dockerState.setShowDockerAdvanced(!dockerState.showDockerAdvanced)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors w-full"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${dockerState.showDockerAdvanced ? 'rotate-90' : ''}`} />
            Container Options
          </button>

          {dockerState.showDockerAdvanced && (
            <div className="mt-2 space-y-3 text-sm">
              {/* Resources */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 font-medium">Resources</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">CPUs</label>
                    <select
                      value={dockerState.dockerCpus}
                      onChange={(e) => dockerState.setDockerCpus(Number(e.target.value))}
                      className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {[1, 2, 4, 8].map(n => <option key={n} value={n}>{n} CPU{n > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Memory</label>
                    <select
                      value={dockerState.dockerMemory}
                      onChange={(e) => dockerState.setDockerMemory(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {['1g', '2g', '4g', '8g', '16g'].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Mounts */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 font-medium">Bind Mounts</label>
                {dockerState.dockerMounts.map((mount, i) => (
                  <div key={i} className="flex gap-1 items-center">
                    <input
                      type="text"
                      value={mount.hostPath}
                      onChange={(e) => {
                        const updated = [...dockerState.dockerMounts]
                        updated[i] = { ...updated[i], hostPath: e.target.value }
                        dockerState.setDockerMounts(updated)
                      }}
                      placeholder="/host/path"
                      className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-gray-600 text-xs">:</span>
                    <input
                      type="text"
                      value={mount.containerPath}
                      onChange={(e) => {
                        const updated = [...dockerState.dockerMounts]
                        updated[i] = { ...updated[i], containerPath: e.target.value }
                        dockerState.setDockerMounts(updated)
                      }}
                      placeholder="/container/path"
                      className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <label className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={mount.readOnly}
                        onChange={(e) => {
                          const updated = [...dockerState.dockerMounts]
                          updated[i] = { ...updated[i], readOnly: e.target.checked }
                          dockerState.setDockerMounts(updated)
                        }}
                        className="rounded border-gray-600"
                      />
                      ro
                    </label>
                    <button
                      onClick={() => dockerState.setDockerMounts(dockerState.dockerMounts.filter((_, j) => j !== i))}
                      className="text-gray-500 hover:text-red-400 text-xs px-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => dockerState.setDockerMounts([...dockerState.dockerMounts, { hostPath: '', containerPath: '', readOnly: false }])}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  + Add mount
                </button>
              </div>

              {/* Env vars */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 font-medium">Environment Variables</label>
                {dockerState.dockerEnvVars.map((env, i) => (
                  <div key={i} className="flex gap-1 items-center">
                    <input
                      type="text"
                      value={env.key}
                      onChange={(e) => {
                        const updated = [...dockerState.dockerEnvVars]
                        updated[i] = { ...updated[i], key: e.target.value }
                        dockerState.setDockerEnvVars(updated)
                      }}
                      placeholder="KEY"
                      className="w-28 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                    <span className="text-gray-600 text-xs">=</span>
                    <input
                      type="text"
                      value={env.value}
                      onChange={(e) => {
                        const updated = [...dockerState.dockerEnvVars]
                        updated[i] = { ...updated[i], value: e.target.value }
                        dockerState.setDockerEnvVars(updated)
                      }}
                      placeholder="value"
                      className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => dockerState.setDockerEnvVars(dockerState.dockerEnvVars.filter((_, j) => j !== i))}
                      className="text-gray-500 hover:text-red-400 text-xs px-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => dockerState.setDockerEnvVars([...dockerState.dockerEnvVars, { key: '', value: '' }])}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  + Add variable
                </button>
              </div>

              {/* Hooks */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 font-medium">Lifecycle Hooks</label>
                <div>
                  <label className="text-xs text-gray-400">On wake</label>
                  <input
                    type="text"
                    value={dockerState.dockerOnWake}
                    onChange={(e) => dockerState.setDockerOnWake(e.target.value)}
                    placeholder="e.g. npm install"
                    className="w-full mt-0.5 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">On hibernate</label>
                  <input
                    type="text"
                    value={dockerState.dockerOnHibernate}
                    onChange={(e) => dockerState.setDockerOnHibernate(e.target.value)}
                    placeholder="e.g. npm run cleanup"
                    className="w-full mt-0.5 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 font-medium">Options</label>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={dockerState.dockerYolo} onChange={(e) => dockerState.setDockerYolo(e.target.checked)} className="rounded border-gray-600" />
                    Skip permission prompts (yolo)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={dockerState.dockerMeshAware} onChange={(e) => dockerState.setDockerMeshAware(e.target.checked)} className="rounded border-gray-600" />
                    Mesh networking
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={dockerState.dockerAutoRemove} onChange={(e) => dockerState.setDockerAutoRemove(e.target.checked)} className="rounded border-gray-600" />
                    Auto-remove container on delete
                  </label>
                </div>
              </div>

              {/* GitHub token */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-medium">GitHub Token</label>
                <input
                  type="password"
                  value={dockerState.dockerGithubToken}
                  onChange={(e) => dockerState.setDockerGithubToken(e.target.value)}
                  placeholder="ghp_... (optional)"
                  className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cloud: EC2 required fields — always visible */}
      {runtime === 'ec2' && cloudState && (
        <div className="border-t border-gray-700/50 pt-2 space-y-3 text-sm">
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">Domain *</label>
            <input
              type="text"
              value={cloudState.cloudDomain}
              onChange={(e) => cloudState.setCloudDomain(e.target.value)}
              placeholder="agent.example.com"
              className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400">SSL Email *</label>
              <input
                type="text"
                value={cloudState.cloudSslEmail}
                onChange={(e) => cloudState.setCloudSslEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full mt-0.5 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">SSH Key Name *</label>
              <input
                type="text"
                value={cloudState.cloudKeyName}
                onChange={(e) => cloudState.setCloudKeyName(e.target.value)}
                placeholder="my-key"
                className="w-full mt-0.5 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400">Instance Type</label>
            <select
              value={cloudState.cloudInstanceType}
              onChange={(e) => cloudState.setCloudInstanceType(e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {['t4g.micro', 't4g.small', 't4g.medium', 't4g.large', 't4g.xlarge'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Cloud: ECS options — always visible */}
      {runtime === 'ecs' && cloudState && (
        <div className="border-t border-gray-700/50 pt-2 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400">CPU (Fargate units)</label>
              <select
                value={cloudState.cloudEcsCpu}
                onChange={(e) => cloudState.setCloudEcsCpu(Number(e.target.value))}
                className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {[256, 512, 1024, 2048, 4096].map(n => (
                  <option key={n} value={n}>{n} ({n / 1024} vCPU)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Memory (MB)</label>
              <select
                value={cloudState.cloudEcsMemory}
                onChange={(e) => cloudState.setCloudEcsMemory(Number(e.target.value))}
                className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {[512, 1024, 2048, 4096, 8192].map(n => (
                  <option key={n} value={n}>{n} MB</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500">Docker image auto-built from agent-container/Dockerfile</p>
        </div>
      )}

      {/* Cloud: shared options (region, keys) — collapsible */}
      {(runtime === 'ec2' || runtime === 'ecs') && cloudState && (
        <div className="border-t border-gray-700/50 pt-2">
          <button
            onClick={() => setShowCloudOptions(!showCloudOptions)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors w-full"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${showCloudOptions ? 'rotate-90' : ''}`} />
            More Options
          </button>

          {showCloudOptions && (
            <div className="mt-2 space-y-3 text-sm">
              {/* Domain for ECS (optional) */}
              {runtime === 'ecs' && (
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-medium">Domain (optional)</label>
                  <input
                    type="text"
                    value={cloudState.cloudDomain}
                    onChange={(e) => cloudState.setCloudDomain(e.target.value)}
                    placeholder="agent.example.com"
                    className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* ECR Image Override (ECS only) */}
              {runtime === 'ecs' && (
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-medium">ECR Image Override</label>
                  <input
                    type="text"
                    value={cloudState.cloudEcrImageOverride}
                    onChange={(e) => cloudState.setCloudEcrImageOverride(e.target.value)}
                    placeholder="123456.dkr.ecr.region.amazonaws.com/repo:tag"
                    className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-600">For pre-built images. Leave empty to auto-build.</p>
                </div>
              )}

              {/* AWS Region */}
              <div>
                <label className="text-xs text-gray-400">AWS Region</label>
                <select
                  value={cloudState.cloudAwsRegion}
                  onChange={(e) => cloudState.setCloudAwsRegion(e.target.value)}
                  className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* API Keys — optional */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 font-medium">API Keys</label>
                <p className="text-xs text-gray-600">Optional if your AI tool uses token-based subscription auth.</p>
                <div>
                  <label className="text-xs text-gray-400">Anthropic API Key</label>
                  <input
                    type="password"
                    value={cloudState.cloudAnthropicKey}
                    onChange={(e) => cloudState.setCloudAnthropicKey(e.target.value)}
                    placeholder="sk-ant-... (optional)"
                    className="w-full mt-0.5 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">GitHub Token</label>
                  <input
                    type="password"
                    value={cloudState.cloudGithubToken}
                    onChange={(e) => cloudState.setCloudGithubToken(e.target.value)}
                    placeholder="ghp_... (optional)"
                    className="w-full mt-0.5 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onCreate}
        disabled={runtime === 'ec2' && cloudState && (!cloudState.cloudDomain || !cloudState.cloudSslEmail || !cloudState.cloudKeyName)}
        className={`w-full mt-3 px-4 py-2.5 text-white font-semibold rounded-lg shadow-lg transition-all duration-300 text-sm ${
          runtime === 'ec2' && cloudState && (!cloudState.cloudDomain || !cloudState.cloudSslEmail || !cloudState.cloudKeyName)
            ? 'bg-gray-600 cursor-not-allowed shadow-none'
            : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-500/25 hover:shadow-green-500/40 transform hover:scale-[1.02]'
        }`}
      >
        {(runtime === 'ec2' || runtime === 'ecs') ? 'Deploy to AWS!' : 'Create Agent!'}
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

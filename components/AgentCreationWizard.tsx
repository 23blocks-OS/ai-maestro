'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowLeft, ChevronRight, Monitor, Server, Cloud, Lock, Wifi, WifiOff, Box } from 'lucide-react'
import CreateAgentAnimation, { getPreviewAvatarUrl } from './CreateAgentAnimation'
import DirectoryPicker from './DirectoryPicker'
import TrustLevelSelector from './TrustLevelSelector'
import { useHosts } from '@/hooks/useHosts'
import type { Host } from '@/types/host'
import type { AgentPermissionMode } from '@/types/agent'
import { getRandomAlias } from '@/lib/agent-utils'

// --- Types ---

type WizardStep = 'name' | 'directory' | 'deployment' | 'confirm' | 'creating' | 'done'

interface ChatMessage {
  id: string
  role: 'robot' | 'user'
  text: string
  step: WizardStep
  widget?: 'text-input' | 'directory-picker' | 'deployment-picker' | 'summary'
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

type Runtime = 'tmux' | 'docker' | 'ec2' | 'ecs'

interface DeploymentOption {
  id: string
  hostId: string
  runtime: Runtime
  label: string
  description: string
  group: 'local' | 'mesh' | 'cloud'
  available: boolean
  reason?: string  // Why it's unavailable
  hostOnline?: boolean
}

// --- Constants ---

const STEP_ORDER: WizardStep[] = ['name', 'directory', 'deployment', 'confirm']

let msgCounter = 0
function makeMsg(role: 'robot' | 'user', text: string, step: WizardStep, widget?: ChatMessage['widget']): ChatMessage {
  return { id: `msg-${++msgCounter}-${Math.random().toString(36).slice(2, 6)}`, role, text, step, widget }
}

function robotQuestion(step: WizardStep): ChatMessage {
  switch (step) {
    case 'name':
      return makeMsg('robot', "What's your agent's name?", step, 'text-input')
    case 'directory':
      return makeMsg('robot', 'Where should this agent work?', step, 'directory-picker')
    case 'deployment':
      return makeMsg('robot', 'Where do you want to run this agent?', step, 'deployment-picker')
    case 'confirm':
      return makeMsg('robot', "Here's your new agent! Ready to bring it to life?", step, 'summary')
    default:
      return makeMsg('robot', '', step)
  }
}

// --- Build deployment options from hosts ---

function buildDeploymentOptions(hosts: Host[]): DeploymentOption[] {
  const options: DeploymentOption[] = []
  const selfHost = hosts.find(h => h.isSelf)

  // LOCAL: This Mac (direct)
  if (selfHost) {
    options.push({
      id: `${selfHost.id}-tmux`,
      hostId: selfHost.id,
      runtime: 'tmux',
      label: 'This Mac (direct)',
      description: 'Run directly in a tmux session',
      group: 'local',
      available: true,
    })

    // LOCAL: This Mac (Docker)
    options.push({
      id: `${selfHost.id}-docker`,
      hostId: selfHost.id,
      runtime: 'docker',
      label: 'This Mac (Docker container)',
      description: 'Run in an isolated Docker container',
      group: 'local',
      available: !!selfHost.capabilities?.docker,
      reason: selfHost.capabilities?.docker ? undefined : 'Install Docker to enable',
    })
  }

  // MESH SERVERS
  const remoteHosts = hosts.filter(h => !h.isSelf)
  for (const host of remoteHosts) {
    const isOnline = getHostStatus(host) === 'online'

    options.push({
      id: `${host.id}-tmux`,
      hostId: host.id,
      runtime: 'tmux',
      label: `${host.name || host.id} (direct)`,
      description: host.url,
      group: 'mesh',
      available: isOnline,
      reason: isOnline ? undefined : 'Host is offline',
      hostOnline: isOnline,
    })

    // Remote host Docker (we can't know capabilities for remote hosts unless they report it)
    if (host.capabilities?.docker) {
      options.push({
        id: `${host.id}-docker`,
        hostId: host.id,
        runtime: 'docker',
        label: `${host.name || host.id} (Docker)`,
        description: host.url,
        group: 'mesh',
        available: isOnline,
        reason: isOnline ? undefined : 'Host is offline',
        hostOnline: isOnline,
      })
    }
  }

  // CLOUD
  const hasAws = selfHost?.capabilities?.cloud?.aws
  const awsRegion = selfHost?.capabilities?.cloud?.awsRegion || 'us-east-1'

  options.push({
    id: 'cloud-ec2',
    hostId: selfHost?.id || '',
    runtime: 'ec2',
    label: 'AWS EC2 (dedicated server)',
    description: hasAws ? `Region: ${awsRegion}` : 'Dedicated virtual machine on AWS',
    group: 'cloud',
    available: !!hasAws,
    reason: hasAws ? undefined : "Run 'aws configure' and install Terraform to enable",
  })

  options.push({
    id: 'cloud-ecs',
    hostId: selfHost?.id || '',
    runtime: 'ecs',
    label: 'AWS ECS (serverless container)',
    description: hasAws ? `Region: ${awsRegion}` : 'Serverless container on AWS Fargate',
    group: 'cloud',
    available: !!hasAws,
    reason: hasAws ? undefined : "Run 'aws configure' and install Terraform to enable",
  })

  return options
}

function getHostStatus(host: Host): 'online' | 'offline' | 'unknown' {
  if (host.isSelf) return 'online'
  if (host.lastSyncSuccess) {
    const syncAge = Date.now() - new Date(host.lastSyncSuccess).getTime()
    // Consider online if synced within last 5 minutes
    return syncAge < 300000 ? 'online' : 'offline'
  }
  if (host.lastSyncError) return 'offline'
  return 'unknown'
}

// --- Props ---

interface AgentCreationWizardProps {
  onClose: () => void
  onComplete: () => void
}

// --- Component ---

export default function AgentCreationWizard({ onClose, onComplete }: AgentCreationWizardProps) {
  const { hosts, loading: hostsLoading } = useHosts()
  const [robotAvatarIndex] = useState(() => Math.floor(Math.random() * 45))
  const robotAvatarUrl = `/avatars/robots_${robotAvatarIndex.toString().padStart(2, '0')}.png`

  const chatEndRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [step, setStep] = useState<WizardStep>('name')

  // Agent configuration
  const [agentName, setAgentName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentOption | null>(null)
  const [hostId, setHostId] = useState('')
  const [runtime, setRuntime] = useState<Runtime>('tmux')

  // Docker advanced options
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [dockerCpus, setDockerCpus] = useState(2)
  const [dockerMemory, setDockerMemory] = useState('4g')
  const [dockerMounts, setDockerMounts] = useState<DockerMount[]>([])
  const [dockerEnvVars, setDockerEnvVars] = useState<DockerEnvVar[]>([])
  const [dockerOnWake, setDockerOnWake] = useState('')
  const [dockerOnHibernate, setDockerOnHibernate] = useState('')
  const [dockerGithubToken, setDockerGithubToken] = useState('')
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>('supervised')
  const [dockerMeshAware, setDockerMeshAware] = useState(false)
  const [dockerAutoRemove, setDockerAutoRemove] = useState(false)

  // Cloud state
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

  // Creation state
  const [isCreating, setIsCreating] = useState(false)
  const [animationPhase, setAnimationPhase] = useState<'preparing' | 'creating' | 'ready' | 'error'>('preparing')
  const [animationProgress, setAnimationProgress] = useState(0)
  const [creationSuccess, setCreationSuccess] = useState(false)
  const [showLetsGo, setShowLetsGo] = useState(false)
  const [creationError, setCreationError] = useState('')

  // Input state
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState('')

  // Widget tracking
  const [activeWidgetStep, setActiveWidgetStep] = useState<WizardStep | null>(null)
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current) }
  }, [])

  // Initialize first question
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (hostsLoading || initialized) return
    setInitialized(true)
    setStep('name')
    setActiveWidgetStep('name')

    // Default to self host
    const selfHost = hosts.find(h => h.isSelf) || hosts[0]
    if (selfHost) setHostId(selfHost.id)

    setTimeout(() => {
      setMessages([
        makeMsg('robot', "Hey! Let's set up a new agent.", 'name'),
        robotQuestion('name'),
      ])
    }, 200)
  }, [hostsLoading, initialized, hosts])

  // Auto-scroll
  useEffect(() => {
    const timer = setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
    return () => clearTimeout(timer)
  }, [messages, showLetsGo, isCreating])

  // Advance
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

  // Go back
  const goBack = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
    const idx = STEP_ORDER.indexOf(step)
    if (idx <= 0) return

    const prevStep = STEP_ORDER[idx - 1]
    setMessages(msgs => msgs.filter(m => m.step !== step && !(m.step === prevStep && m.role === 'user')))
    setStep(prevStep)
    setActiveWidgetStep(prevStep)
  }, [step])

  // --- Handlers ---

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

  const handleDirectoryConfirm = useCallback(() => {
    advance(workingDirectory || '~ (home directory)', 'deployment')
  }, [workingDirectory, advance])

  const handleDirectorySkip = useCallback(() => {
    setWorkingDirectory('')
    advance('Skipped (use home directory)', 'deployment')
  }, [advance])

  const handleDeploymentSelect = useCallback((option: DeploymentOption) => {
    if (!option.available) return
    setSelectedDeployment(option)
    setHostId(option.hostId)
    setRuntime(option.runtime)
    advance(option.label, 'confirm')
  }, [advance])

  // --- Create agent ---
  const handleCreate = useCallback(async () => {
    setIsCreating(true)
    setStep('creating')
    setMessages(prev => [...prev, makeMsg('user', "Let's do it!", 'confirm')])

    const personaName = getRandomAlias(agentName)
    const avatarUrl = getPreviewAvatarUrl(agentName)
    const program = 'claude-code'  // Default to Claude Code

    try {
      if (runtime === 'ec2' || runtime === 'ecs') {
        const cloudPayload: Record<string, unknown> = {
          name: agentName,
          provider: runtime,
          label: personaName,
          avatar: avatarUrl,
          program: 'claude',
        }
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
        const dockerPayload: Record<string, unknown> = {
          name: agentName,
          workingDirectory: workingDirectory || undefined,
          hostId: hostId || undefined,
          program,
          label: personaName,
          avatar: avatarUrl,
        }

        if (showAdvanced) {
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
          if (permissionMode !== 'supervised') dockerPayload.permissionMode = permissionMode
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
  }, [agentName, workingDirectory, hostId, runtime, showAdvanced, dockerCpus, dockerMemory, dockerMounts, dockerEnvVars, dockerOnWake, dockerOnHibernate, dockerGithubToken, permissionMode, dockerMeshAware, dockerAutoRemove, cloudEcrImageOverride, cloudDomain, cloudSslEmail, cloudKeyName, cloudAwsRegion, cloudInstanceType, cloudEcsCpu, cloudEcsMemory, cloudAnthropicKey, cloudGithubToken])

  // Animation timer
  const isCloudRuntime = runtime === 'ec2' || runtime === 'ecs'

  useEffect(() => {
    if (!isCreating) return
    setAnimationPhase('preparing')
    setAnimationProgress(5)

    if (!isCloudRuntime) {
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

  // Snap to complete on success
  useEffect(() => {
    if (creationSuccess && animationPhase !== 'ready') {
      setAnimationPhase('ready')
      setAnimationProgress(100)
      const timer = setTimeout(() => setShowLetsGo(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [creationSuccess, animationPhase])

  // Computed
  const stepNumber = STEP_ORDER.indexOf(step) + 1
  const totalSteps = STEP_ORDER.length
  const canGoBack = step !== 'creating' && step !== 'done' && STEP_ORDER.indexOf(step) > 0
  const deploymentOptions = buildDeploymentOptions(hosts)

  // --- Render ---
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={isCreating ? undefined : onClose}>
      <div
        className="bg-gray-900 rounded-xl w-full max-w-3xl shadow-2xl border border-gray-700 overflow-hidden flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/50">
          <h3 className="text-base font-semibold text-gray-100">New Agent</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
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
                  <p className="text-sm text-gray-400">Preparing...</p>
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
                      Let&apos;s Go!
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
                        setStep('confirm')
                        setActiveWidgetStep('confirm')
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
                      deploymentOptions={deploymentOptions}
                      state={{
                        agentName, workingDirectory, hostId, runtime, selectedDeployment,
                        showAdvanced, setShowAdvanced,
                        dockerCpus, setDockerCpus, dockerMemory, setDockerMemory,
                        dockerMounts, setDockerMounts, dockerEnvVars, setDockerEnvVars,
                        dockerOnWake, setDockerOnWake, dockerOnHibernate, setDockerOnHibernate,
                        dockerGithubToken, setDockerGithubToken,
                        permissionMode, setPermissionMode, dockerMeshAware, setDockerMeshAware,
                        dockerAutoRemove, setDockerAutoRemove,
                        cloudEcrImageOverride, setCloudEcrImageOverride,
                        cloudDomain, setCloudDomain, cloudSslEmail, setCloudSslEmail,
                        cloudKeyName, setCloudKeyName, cloudAwsRegion, setCloudAwsRegion,
                        cloudInstanceType, setCloudInstanceType,
                        cloudEcsCpu, setCloudEcsCpu, cloudEcsMemory, setCloudEcsMemory,
                        cloudAnthropicKey, setCloudAnthropicKey, cloudGithubToken, setCloudGithubToken,
                      }}
                      nameInput={nameInput}
                      nameError={nameError}
                      onNameChange={(v) => { setNameInput(v); setNameError('') }}
                      onNameSubmit={handleNameSubmit}
                      onDirectoryChange={setWorkingDirectory}
                      onDirectoryConfirm={handleDirectoryConfirm}
                      onDirectorySkip={handleDirectorySkip}
                      onDeploymentSelect={handleDeploymentSelect}
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

interface BubbleState {
  agentName: string
  workingDirectory: string
  hostId: string
  runtime: Runtime
  selectedDeployment: DeploymentOption | null
  showAdvanced: boolean
  setShowAdvanced: (v: boolean) => void
  dockerCpus: number; setDockerCpus: (v: number) => void
  dockerMemory: string; setDockerMemory: (v: string) => void
  dockerMounts: DockerMount[]; setDockerMounts: (v: DockerMount[]) => void
  dockerEnvVars: DockerEnvVar[]; setDockerEnvVars: (v: DockerEnvVar[]) => void
  dockerOnWake: string; setDockerOnWake: (v: string) => void
  dockerOnHibernate: string; setDockerOnHibernate: (v: string) => void
  dockerGithubToken: string; setDockerGithubToken: (v: string) => void
  permissionMode: AgentPermissionMode; setPermissionMode: (v: AgentPermissionMode) => void
  dockerMeshAware: boolean; setDockerMeshAware: (v: boolean) => void
  dockerAutoRemove: boolean; setDockerAutoRemove: (v: boolean) => void
  cloudEcrImageOverride: string; setCloudEcrImageOverride: (v: string) => void
  cloudDomain: string; setCloudDomain: (v: string) => void
  cloudSslEmail: string; setCloudSslEmail: (v: string) => void
  cloudKeyName: string; setCloudKeyName: (v: string) => void
  cloudAwsRegion: string; setCloudAwsRegion: (v: string) => void
  cloudInstanceType: string; setCloudInstanceType: (v: string) => void
  cloudEcsCpu: number; setCloudEcsCpu: (v: number) => void
  cloudEcsMemory: number; setCloudEcsMemory: (v: number) => void
  cloudAnthropicKey: string; setCloudAnthropicKey: (v: string) => void
  cloudGithubToken: string; setCloudGithubToken: (v: string) => void
}

function ChatBubble({
  message,
  robotAvatarUrl,
  isActiveWidget,
  hosts,
  deploymentOptions,
  state,
  nameInput,
  nameError,
  onNameChange,
  onNameSubmit,
  onDirectoryChange,
  onDirectoryConfirm,
  onDirectorySkip,
  onDeploymentSelect,
  onCreate,
}: {
  message: ChatMessage
  robotAvatarUrl: string
  isActiveWidget: boolean
  hosts: Host[]
  deploymentOptions: DeploymentOption[]
  state: BubbleState
  nameInput: string
  nameError: string
  onNameChange: (v: string) => void
  onNameSubmit: () => void
  onDirectoryChange: (v: string) => void
  onDirectoryConfirm: () => void
  onDirectorySkip: () => void
  onDeploymentSelect: (opt: DeploymentOption) => void
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

        {isRobot && message.widget && isActiveWidget && (
          <div className="mt-2">
            {message.widget === 'text-input' && (
              <NameInput
                value={nameInput}
                onChange={onNameChange}
                onSubmit={onNameSubmit}
                error={nameError}
              />
            )}

            {message.widget === 'directory-picker' && (
              <DirectoryStep
                value={state.workingDirectory}
                onChange={onDirectoryChange}
                onConfirm={onDirectoryConfirm}
                onSkip={onDirectorySkip}
                hostId={state.hostId}
                hosts={hosts}
              />
            )}

            {message.widget === 'deployment-picker' && (
              <DeploymentPicker
                options={deploymentOptions}
                onSelect={onDeploymentSelect}
              />
            )}

            {message.widget === 'summary' && (
              <SummaryCard
                state={state}
                hosts={hosts}
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

function NameInput({
  value,
  onChange,
  onSubmit,
  error,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  error: string
}) {
  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
          placeholder="my-agent"
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
      {!error && <p className="text-xs text-gray-500 mt-1">Letters, numbers, dashes, and underscores only</p>}
    </div>
  )
}

function DirectoryStep({
  value,
  onChange,
  onConfirm,
  onSkip,
  hostId,
  hosts,
}: {
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  onSkip: () => void
  hostId: string
  hosts: Host[]
}) {
  const host = hosts.find(h => h.id === hostId)
  const remoteHostId = host && !host.isSelf ? host.id : undefined

  return (
    <div className="space-y-2">
      <DirectoryPicker
        value={value}
        onChange={onChange}
        hostId={remoteHostId}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={onConfirm}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          Select this folder
        </button>
        <button
          onClick={onSkip}
          className="px-3 py-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          Skip (use home directory)
        </button>
      </div>
    </div>
  )
}

function DeploymentPicker({
  options,
  onSelect,
}: {
  options: DeploymentOption[]
  onSelect: (opt: DeploymentOption) => void
}) {
  const localOptions = options.filter(o => o.group === 'local')
  const meshOptions = options.filter(o => o.group === 'mesh')
  const cloudOptions = options.filter(o => o.group === 'cloud')

  return (
    <div className="space-y-3">
      {/* LOCAL */}
      <DeploymentGroup
        title="LOCAL"
        icon={<Monitor className="w-3.5 h-3.5" />}
        options={localOptions}
        onSelect={onSelect}
      />

      {/* MESH SERVERS */}
      {meshOptions.length > 0 && (
        <DeploymentGroup
          title="MESH SERVERS"
          icon={<Server className="w-3.5 h-3.5" />}
          options={meshOptions}
          onSelect={onSelect}
        />
      )}

      {/* CLOUD */}
      <DeploymentGroup
        title="CLOUD"
        icon={<Cloud className="w-3.5 h-3.5" />}
        options={cloudOptions}
        onSelect={onSelect}
      />
    </div>
  )
}

function DeploymentGroup({
  title,
  icon,
  options,
  onSelect,
}: {
  title: string
  icon: React.ReactNode
  options: DeploymentOption[]
  onSelect: (opt: DeploymentOption) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-gray-500">{icon}</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
      </div>
      <div className="space-y-1">
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => opt.available && onSelect(opt)}
            disabled={!opt.available}
            className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
              opt.available
                ? 'bg-gray-800/60 border-gray-700 hover:border-blue-500/50 hover:bg-gray-800 cursor-pointer'
                : 'bg-gray-800/20 border-gray-800 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {opt.runtime === 'docker' && <Box className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                <span className={`font-medium ${opt.available ? 'text-gray-200' : 'text-gray-500'}`}>
                  {opt.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {opt.hostOnline !== undefined && (
                  opt.hostOnline
                    ? <Wifi className="w-3 h-3 text-green-500" />
                    : <WifiOff className="w-3 h-3 text-red-400" />
                )}
                {!opt.available && <Lock className="w-3 h-3 text-gray-600" />}
              </div>
            </div>
            {opt.available ? (
              <div className="text-xs text-gray-500 mt-0.5">{opt.description}</div>
            ) : (
              <div className="text-xs text-amber-500/70 mt-0.5">{opt.reason}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({
  state,
  hosts,
  onCreate,
}: {
  state: BubbleState
  hosts: Host[]
  onCreate: () => void
}) {
  const host = hosts.find(h => h.id === state.hostId)
  const runtimeLabel = {
    tmux: 'Direct (tmux)',
    docker: 'Docker container',
    ec2: 'AWS EC2 (dedicated)',
    ecs: 'AWS ECS Fargate (serverless)',
  }[state.runtime] || state.runtime

  const isEc2MissingRequired = state.runtime === 'ec2' && (!state.cloudDomain || !state.cloudSslEmail || !state.cloudKeyName)

  return (
    <div className="rounded-xl bg-gray-800/60 border border-gray-700 p-4 space-y-2.5">
      <SummaryRow label="Name" value={state.agentName} />
      {state.runtime !== 'ec2' && state.runtime !== 'ecs' && (
        <SummaryRow label="Directory" value={state.workingDirectory || '~ (home directory)'} />
      )}
      <SummaryRow label="Deployment" value={runtimeLabel} />
      <SummaryRow label="Host" value={host?.isSelf ? 'This computer' : (host?.name || state.hostId || 'Local')} />
      <SummaryRow label="AI Tool" value="Claude Code" />

      {/* Advanced options — collapsible */}
      {(state.runtime === 'docker' || state.runtime === 'ec2' || state.runtime === 'ecs') && (
        <div className="border-t border-gray-700/50 pt-2">
          <button
            onClick={() => state.setShowAdvanced(!state.showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors w-full"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${state.showAdvanced ? 'rotate-90' : ''}`} />
            Advanced Options
          </button>

          {state.showAdvanced && (
            <div className="mt-2 space-y-3 text-sm">
              {/* Docker advanced */}
              {state.runtime === 'docker' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">CPUs</label>
                      <select value={state.dockerCpus} onChange={(e) => state.setDockerCpus(Number(e.target.value))} className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        {[1, 2, 4, 8].map(n => <option key={n} value={n}>{n} CPU{n > 1 ? 's' : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Memory</label>
                      <select value={state.dockerMemory} onChange={(e) => state.setDockerMemory(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        {['1g', '2g', '4g', '8g', '16g'].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Mounts */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500 font-medium">Bind Mounts</label>
                    {state.dockerMounts.map((mount, i) => (
                      <div key={i} className="flex gap-1 items-center">
                        <input type="text" value={mount.hostPath} onChange={(e) => { const u = [...state.dockerMounts]; u[i] = { ...u[i], hostPath: e.target.value }; state.setDockerMounts(u) }} placeholder="/host/path" className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <span className="text-gray-600 text-xs">:</span>
                        <input type="text" value={mount.containerPath} onChange={(e) => { const u = [...state.dockerMounts]; u[i] = { ...u[i], containerPath: e.target.value }; state.setDockerMounts(u) }} placeholder="/container/path" className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button onClick={() => state.setDockerMounts(state.dockerMounts.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400 text-xs px-1"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <button onClick={() => state.setDockerMounts([...state.dockerMounts, { hostPath: '', containerPath: '', readOnly: false }])} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">+ Add mount</button>
                  </div>

                  {/* Env vars */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500 font-medium">Environment Variables</label>
                    {state.dockerEnvVars.map((env, i) => (
                      <div key={i} className="flex gap-1 items-center">
                        <input type="text" value={env.key} onChange={(e) => { const u = [...state.dockerEnvVars]; u[i] = { ...u[i], key: e.target.value }; state.setDockerEnvVars(u) }} placeholder="KEY" className="w-28 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                        <span className="text-gray-600 text-xs">=</span>
                        <input type="text" value={env.value} onChange={(e) => { const u = [...state.dockerEnvVars]; u[i] = { ...u[i], value: e.target.value }; state.setDockerEnvVars(u) }} placeholder="value" className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button onClick={() => state.setDockerEnvVars(state.dockerEnvVars.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400 text-xs px-1"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <button onClick={() => state.setDockerEnvVars([...state.dockerEnvVars, { key: '', value: '' }])} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">+ Add variable</button>
                  </div>

                  {/* Trust Level */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500 font-medium">Trust Level</label>
                    <TrustLevelSelector value={state.permissionMode} onChange={state.setPermissionMode} compact />
                  </div>

                  {/* Toggles */}
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={state.dockerMeshAware} onChange={(e) => state.setDockerMeshAware(e.target.checked)} className="rounded border-gray-600" />
                      Mesh networking
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={state.dockerAutoRemove} onChange={(e) => state.setDockerAutoRemove(e.target.checked)} className="rounded border-gray-600" />
                      Auto-remove container on delete
                    </label>
                  </div>
                </>
              )}

              {/* EC2 required fields */}
              {state.runtime === 'ec2' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium">Domain *</label>
                    <input type="text" value={state.cloudDomain} onChange={(e) => state.setCloudDomain(e.target.value)} placeholder="agent.example.com" className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">SSL Email *</label>
                      <input type="text" value={state.cloudSslEmail} onChange={(e) => state.setCloudSslEmail(e.target.value)} placeholder="admin@example.com" className="w-full mt-0.5 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">SSH Key Name *</label>
                      <input type="text" value={state.cloudKeyName} onChange={(e) => state.setCloudKeyName(e.target.value)} placeholder="my-key" className="w-full mt-0.5 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Instance Type</label>
                    <select value={state.cloudInstanceType} onChange={(e) => state.setCloudInstanceType(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {['t4g.micro', 't4g.small', 't4g.medium', 't4g.large', 't4g.xlarge'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </>
              )}

              {/* ECS options */}
              {state.runtime === 'ecs' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">CPU (Fargate units)</label>
                    <select value={state.cloudEcsCpu} onChange={(e) => state.setCloudEcsCpu(Number(e.target.value))} className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {[256, 512, 1024, 2048, 4096].map(n => <option key={n} value={n}>{n} ({n / 1024} vCPU)</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Memory (MB)</label>
                    <select value={state.cloudEcsMemory} onChange={(e) => state.setCloudEcsMemory(Number(e.target.value))} className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {[512, 1024, 2048, 4096, 8192].map(n => <option key={n} value={n}>{n} MB</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Cloud shared: Region + API keys */}
              {(state.runtime === 'ec2' || state.runtime === 'ecs') && (
                <>
                  <div>
                    <label className="text-xs text-gray-400">AWS Region</label>
                    <select value={state.cloudAwsRegion} onChange={(e) => state.setCloudAwsRegion(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500 font-medium">API Keys (optional)</label>
                    <div>
                      <label className="text-xs text-gray-400">Anthropic API Key</label>
                      <input type="password" value={state.cloudAnthropicKey} onChange={(e) => state.setCloudAnthropicKey(e.target.value)} placeholder="sk-ant-..." className="w-full mt-0.5 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">GitHub Token</label>
                      <input type="password" value={state.cloudGithubToken} onChange={(e) => state.setCloudGithubToken(e.target.value)} placeholder="ghp_..." className="w-full mt-0.5 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={onCreate}
        disabled={isEc2MissingRequired}
        className={`w-full mt-3 px-4 py-2.5 text-white font-semibold rounded-lg shadow-lg transition-all duration-300 text-sm ${
          isEc2MissingRequired
            ? 'bg-gray-600 cursor-not-allowed shadow-none'
            : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-500/25 hover:shadow-green-500/40 transform hover:scale-[1.02]'
        }`}
      >
        {(state.runtime === 'ec2' || state.runtime === 'ecs') ? 'Deploy to AWS!' : 'Create Agent!'}
      </button>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-200 font-medium truncate ml-4 text-right">{value}</span>
    </div>
  )
}

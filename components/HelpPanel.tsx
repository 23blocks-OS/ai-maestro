'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  ArrowLeft,
  Clock,
  Sparkles,
  Mail,
  Brain,
  Share2,
  ArrowRightLeft,
  Server,
  ChevronRight,
  BookOpen,
  Terminal,
  User,
  Moon,
  FileText,
  Globe,
  Cpu,
  AlertTriangle,
  MousePointer2,
  KeyRound,
  Shield,
  Smartphone,
  MessageSquare,
  Loader2,
} from 'lucide-react'
import { tutorials, categoryLabels, categoryOrder, type Tutorial } from '@/lib/tutorialData'
import MobileChatView from './MobileChatView'

// Map icon names to components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Mail,
  Brain,
  Share2,
  ArrowRightLeft,
  Server,
  User,
  Moon,
  FileText,
  Globe,
  Cpu,
  AlertTriangle,
  MousePointer2,
  KeyRound,
  Shield,
  Smartphone,
}

interface HelpPanelProps {
  isOpen: boolean
  onClose: () => void
}

type HelpTab = 'assistant' | 'browse'

export default function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  const [activeTab, setActiveTab] = useState<HelpTab>('assistant')
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null)
  const [currentStep, setCurrentStep] = useState(0)

  // Assistant agent state
  const [agentId, setAgentId] = useState<string | null>(null)
  const [agentStatus, setAgentStatus] = useState<'idle' | 'starting' | 'online' | 'error'>('idle')
  const [agentError, setAgentError] = useState<string | null>(null)
  const agentCreatingRef = useRef(false)

  // Create assistant agent when panel opens with assistant tab
  const createAssistant = useCallback(async () => {
    if (agentCreatingRef.current) return
    agentCreatingRef.current = true
    setAgentStatus('starting')
    setAgentError(null)

    try {
      const res = await fetch('/api/help/agent', { method: 'POST' })
      const data = await res.json()

      if (data.success && data.agentId) {
        setAgentId(data.agentId)
        // If already online, set immediately; if starting, poll for readiness
        if (data.status === 'online') {
          setAgentStatus('online')
        } else {
          // Poll until the agent's chat API responds (claude is initialized)
          let attempts = 0
          const pollReady = setInterval(async () => {
            attempts++
            try {
              const chatRes = await fetch(`/api/agents/${data.agentId}/chat?limit=1`)
              const chatData = await chatRes.json()
              if (chatData.success) {
                setAgentStatus('online')
                clearInterval(pollReady)
              }
            } catch { /* keep trying */ }
            if (attempts > 30) { // ~30s timeout
              clearInterval(pollReady)
              setAgentStatus('online') // Let user try anyway
            }
          }, 1000)
        }
      } else {
        setAgentStatus('error')
        setAgentError(data.error || 'Failed to create assistant')
      }
    } catch (err) {
      setAgentStatus('error')
      setAgentError(err instanceof Error ? err.message : 'Connection error')
    } finally {
      agentCreatingRef.current = false
    }
  }, [])

  // Kill assistant when panel closes
  const killAssistant = useCallback(async () => {
    if (!agentId) return
    try {
      await fetch('/api/help/agent', { method: 'DELETE' })
    } catch { /* ignore cleanup errors */ }
    setAgentId(null)
    setAgentStatus('idle')
    setAgentError(null)
  }, [agentId])

  // Lifecycle: create on open, kill on close
  useEffect(() => {
    if (isOpen && activeTab === 'assistant' && !agentId && agentStatus === 'idle') {
      createAssistant()
    }

    if (!isOpen && agentId) {
      killAssistant()
    }
  }, [isOpen, activeTab, agentId, agentStatus, createAssistant, killAssistant])

  // Create assistant when switching to assistant tab
  useEffect(() => {
    if (isOpen && activeTab === 'assistant' && !agentId && agentStatus === 'idle') {
      createAssistant()
    }
  }, [activeTab, isOpen, agentId, agentStatus, createAssistant])

  // Reset browse state when panel closes
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setSelectedTutorial(null)
        setCurrentStep(0)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (selectedTutorial) {
          setSelectedTutorial(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, selectedTutorial, onClose])

  const handleBack = () => {
    setSelectedTutorial(null)
    setCurrentStep(0)
  }

  const groupedTutorials = categoryOrder.map(category => ({
    category,
    label: categoryLabels[category],
    tutorials: tutorials.filter(t => t.category === category),
  }))

  return (
    <div
      className={`fixed top-0 right-0 h-full w-[420px] z-50 transform transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-full bg-gray-950/95 backdrop-blur-xl border-l border-gray-800/50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800/50">
          <div className="flex items-center justify-between mb-3">
            {activeTab === 'browse' && selectedTutorial ? (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-sm font-medium">All Tutorials</span>
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-blue-500/20">
                  <BookOpen className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">AI Maestro Help</h2>
                  <p className="text-xs text-gray-500">Ask anything or browse tutorials</p>
                </div>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-800/50 text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Close help panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          {!(activeTab === 'browse' && selectedTutorial) && (
            <div className="flex gap-1 bg-gray-800/50 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('assistant')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'assistant'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Assistant
              </button>
              <button
                onClick={() => setActiveTab('browse')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'browse'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Tutorials
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
          {activeTab === 'assistant' ? (
            <AssistantView
              agentId={agentId}
              status={agentStatus}
              error={agentError}
              onRetry={createAssistant}
            />
          ) : selectedTutorial ? (
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
              <TutorialView
                tutorial={selectedTutorial}
                currentStep={currentStep}
                onStepChange={setCurrentStep}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
              <TopicList
                groupedTutorials={groupedTutorials}
                onSelect={setSelectedTutorial}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 py-2 border-t border-gray-800/50 bg-gray-900/50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Press ESC to {selectedTutorial ? 'go back' : 'close'}</span>
            <a
              href="https://github.com/23blocks-OS/ai-maestro/blob/main/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-400 transition-colors"
            >
              Full Documentation
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// Assistant View - wraps MobileChatView with loading/error states
interface AssistantViewProps {
  agentId: string | null
  status: 'idle' | 'starting' | 'online' | 'error'
  error: string | null
  onRetry: () => void
}

function AssistantView({ agentId, status, error, onRetry }: AssistantViewProps) {
  if (status === 'starting' || status === 'idle') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-blue-500/20 mb-4">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
        <p className="text-sm text-gray-300 mb-1">Starting AI Maestro Assistant...</p>
        <p className="text-xs text-gray-500">Launching agent with access to all docs and code</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-sm text-red-300 mb-1">Failed to start assistant</p>
        <p className="text-xs text-gray-500 mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (status === 'online' && agentId) {
    return (
      <MobileChatView
        agentId={agentId}
        agentName="AI Maestro Assistant"
      />
    )
  }

  return null
}

// Topic List View
interface TopicListProps {
  groupedTutorials: { category: string; label: string; tutorials: Tutorial[] }[]
  onSelect: (tutorial: Tutorial) => void
}

function TopicList({ groupedTutorials, onSelect }: TopicListProps) {
  return (
    <div className="py-4 space-y-4">
      {groupedTutorials.map(({ category, label, tutorials }) => (
        <div key={category} className="mb-6">
          <div className="px-5 mb-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              {label}
            </h3>
          </div>
          <div className="space-y-1 px-3">
            {tutorials.map((tutorial) => {
              const IconComponent = iconMap[tutorial.icon] || Sparkles
              return (
                <button
                  key={tutorial.id}
                  onClick={() => onSelect(tutorial)}
                  className="w-full group px-3 py-3 rounded-lg hover:bg-gray-800/50 transition-all duration-200 text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-800/80 group-hover:bg-gray-700/80 flex items-center justify-center transition-colors border border-gray-700/50">
                      <IconComponent className="w-4 h-4 text-gray-400 group-hover:text-blue-400 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                          {tutorial.title}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                        {tutorial.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Clock className="w-3 h-3 text-gray-600" />
                        <span className="text-[10px] text-gray-600">{tutorial.estimatedTime}</span>
                        <span className="text-gray-700 mx-1">&bull;</span>
                        <span className="text-[10px] text-gray-600">{tutorial.steps.length} steps</span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// Tutorial View with Steps
interface TutorialViewProps {
  tutorial: Tutorial
  currentStep: number
  onStepChange: (step: number) => void
}

function TutorialView({ tutorial, currentStep, onStepChange }: TutorialViewProps) {
  const IconComponent = iconMap[tutorial.icon] || Sparkles

  return (
    <div className="py-4">
      <div className="px-5 pb-4 border-b border-gray-800/30">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-blue-500/20">
            <IconComponent className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">{tutorial.title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Clock className="w-3 h-3 text-gray-500" />
              <span className="text-xs text-gray-500">{tutorial.estimatedTime}</span>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-400">{tutorial.description}</p>
      </div>

      <div className="px-5 py-3 flex items-center gap-1.5">
        {tutorial.steps.map((_, idx) => (
          <button
            key={idx}
            onClick={() => onStepChange(idx)}
            className={`h-1 rounded-full transition-all duration-300 ${
              idx === currentStep
                ? 'w-6 bg-blue-500'
                : idx < currentStep
                  ? 'w-3 bg-blue-500/50'
                  : 'w-3 bg-gray-700'
            }`}
            aria-label={`Go to step ${idx + 1}`}
          />
        ))}
        <span className="ml-auto text-xs text-gray-500">
          {currentStep + 1} / {tutorial.steps.length}
        </span>
      </div>

      <div className="px-5 space-y-4">
        {tutorial.steps.map((step, idx) => (
          <div
            key={idx}
            className={`transition-all duration-300 ${
              idx === currentStep
                ? 'opacity-100'
                : idx < currentStep
                  ? 'opacity-50'
                  : 'opacity-30'
            }`}
          >
            <button
              onClick={() => onStepChange(idx)}
              className="w-full text-left group"
            >
              <div className="flex gap-3">
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  idx === currentStep
                    ? 'bg-blue-500 text-white'
                    : idx < currentStep
                      ? 'bg-blue-500/30 text-blue-400'
                      : 'bg-gray-800 text-gray-500'
                }`}>
                  {idx + 1}
                </div>
                <div className="flex-1 pt-0.5">
                  <h4 className={`text-sm font-medium transition-colors ${
                    idx === currentStep ? 'text-white' : 'text-gray-400'
                  }`}>
                    {step.title}
                  </h4>
                  {idx === currentStep && (
                    <div className="mt-2 space-y-3 animate-fadeIn">
                      <p className="text-sm text-gray-400 leading-relaxed">
                        {step.description}
                      </p>
                      {step.tip && (
                        <div className="relative">
                          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 border-b border-gray-800">
                              <Terminal className="w-3 h-3 text-gray-500" />
                              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Command</span>
                            </div>
                            <pre className="px-3 py-2.5 text-sm text-green-400 font-mono overflow-x-auto">
                              <code>{step.tip}</code>
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      <div className="px-5 pt-6 flex items-center gap-3">
        <button
          onClick={() => onStepChange(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onStepChange(Math.min(tutorial.steps.length - 1, currentStep + 1))}
          disabled={currentStep === tutorial.steps.length - 1}
          className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {currentStep === tutorial.steps.length - 1 ? 'Complete' : 'Next'}
        </button>
      </div>
    </div>
  )
}

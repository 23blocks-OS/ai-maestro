'use client'

import { useState } from 'react'
import { ArrowLeft, Check, Terminal, FolderOpen, Play, Book } from 'lucide-react'
import FirstAgentWizard from '../FirstAgentWizard'

interface SingleComputerGuideProps {
  onBack: () => void
  onComplete: () => void
}

export default function SingleComputerGuide({ onBack, onComplete }: SingleComputerGuideProps) {
  const [showWizard, setShowWizard] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    {
      title: 'Welcome to Single Computer Setup',
      icon: Terminal,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Perfect! You&apos;ll run all your AI coding agents on this computer with organized tmux sessions.
          </p>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <h3 className="font-medium text-blue-400 mb-2">What you&apos;ll get:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>One beautiful dashboard for all your AI agents</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Automatic hierarchical organization (apps-frontend-agent1)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Agent notes for documenting your work</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Real-time terminal streaming</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Prerequisites Check:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                  <Check className="w-3 h-3 text-green-400" />
                </div>
                <span>AI Maestro is running (you&apos;re seeing this!)</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                  <Check className="w-3 h-3 text-green-400" />
                </div>
                <span>tmux is installed (AI Maestro requires it)</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gray-500/20 border border-gray-500/30 flex items-center justify-center">
                  <span className="text-xs text-gray-400">?</span>
                </div>
                <span>Claude Code or other AI coding tool (optional but recommended)</span>
              </li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: 'Understanding Sessions',
      icon: FolderOpen,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            AI Maestro organizes your work using <strong>sessions</strong> - think of them as separate workspaces for different tasks.
          </p>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">Naming Convention (Important!):</h3>
            <div className="space-y-3">
              <div>
                <code className="text-sm bg-gray-900 px-2 py-1 rounded text-blue-400">
                  level1-level2-sessionName
                </code>
                <p className="text-sm text-gray-400 mt-1">Use hyphens to create automatic hierarchy</p>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <p className="text-sm font-medium text-gray-300 mb-2">Examples:</p>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li>
                    <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">
                      clients-acme-frontend
                    </code>{' '}
                    → Groups under &quot;clients&quot; → &quot;acme&quot;
                  </li>
                  <li>
                    <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">
                      clients-acme-backend
                    </code>{' '}
                    → Same group, different session
                  </li>
                  <li>
                    <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">
                      personal-blog-writer
                    </code>{' '}
                    → Groups under &quot;personal&quot; → &quot;blog&quot;
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-2">💡 Pro Tip:</p>
            <p className="text-sm text-gray-300">
              Each top-level category gets its own color automatically. Sessions are organized in an expandable accordion, making it easy to manage hundreds of agents.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Create Your First Agent',
      icon: Play,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Let&apos;s create your first AI agent session together!
          </p>

          <div className="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg">
            <h3 className="font-medium text-white mb-3">You can create sessions in two ways:</h3>

            <div className="space-y-3">
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-1">Option 1: Use the Wizard (Recommended)</h4>
                <p className="text-sm text-gray-300 mb-3">
                  We&apos;ll guide you through creating a properly named session with the right working directory.
                </p>
                <button
                  onClick={() => setShowWizard(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white text-sm font-medium"
                >
                  <Play className="w-4 h-4" />
                  Launch Wizard
                </button>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-400 mb-1">Option 2: Manual Creation</h4>
                <p className="text-sm text-gray-400">
                  Click the <strong>+</strong> button in the sidebar after completing onboarding
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">What happens next:</h3>
            <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside">
              <li>Agent appears in the sidebar</li>
              <li>Click it to open the terminal</li>
              <li>Run your AI tool: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">claude</code>, <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">aider</code>, etc.</li>
              <li>Add notes below the terminal to document your work</li>
            </ol>
          </div>
        </div>
      ),
    },
  ]

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleWizardComplete = () => {
    setShowWizard(false)
    // Move to completion or finish onboarding
  }

  if (showWizard) {
    return (
      <FirstAgentWizard
        onComplete={handleWizardComplete}
        onCancel={() => setShowWizard(false)}
      />
    )
  }

  const currentStepData = steps[currentStep]
  const StepIcon = currentStepData.icon

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to use cases
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                <Terminal className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Single Computer Setup</h1>
                <p className="text-sm text-gray-400">Run all your AI agents on this machine</p>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 w-12 rounded-full transition-colors ${
                    index <= currentStep ? 'bg-blue-500' : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* Step Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
              <StepIcon className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Step {currentStep + 1} of {steps.length}</p>
              <h2 className="text-xl font-semibold text-white">{currentStepData.title}</h2>
            </div>
          </div>

          {/* Step Content */}
          <div className="mb-8">{currentStepData.content}</div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-800">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <div className="flex items-center gap-3">
              {currentStep === steps.length - 1 ? (
                <>
                  <a
                    href="https://github.com/23blocks-OS/ai-maestro/blob/main/docs/QUICKSTART.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                  >
                    <Book className="w-4 h-4" />
                    Read Full Guide
                  </a>
                  <button
                    onClick={onComplete}
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Complete Onboarding
                  </button>
                </>
              ) : (
                <button
                  onClick={handleNext}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Next Step
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

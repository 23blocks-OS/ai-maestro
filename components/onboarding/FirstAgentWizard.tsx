'use client'

import { useState, useEffect } from 'react'
import { X, Check, AlertCircle, Terminal } from 'lucide-react'
import CreateAgentAnimation from '../CreateAgentAnimation'

interface FirstAgentWizardProps {
  onComplete: () => void
  onCancel: () => void
}

export default function FirstAgentWizard({ onComplete, onCancel }: FirstAgentWizardProps) {
  const [step, setStep] = useState<'name' | 'directory' | 'creating' | 'success'>('name')
  const [agentName, setAgentName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [animationPhase, setAnimationPhase] = useState<'naming' | 'preparing' | 'creating' | 'ready' | 'error'>('creating')
  const [animationProgress, setAnimationProgress] = useState(0)

  const validateAgentName = (name: string): boolean => {
    // Must be alphanumeric with hyphens/underscores
    const isValid = /^[a-zA-Z0-9_-]+$/.test(name)
    if (!isValid) {
      setError('Agent name can only contain letters, numbers, dashes, and underscores')
      return false
    }

    // Should have at least 2 hyphens for proper hierarchy
    const parts = name.split('-')
    if (parts.length < 3) {
      setError('For best organization, use format: level1-level2-name (e.g., apps-todo-frontend)')
      // Warning but allow
    }

    setError(null)
    return true
  }

  const handleNameNext = () => {
    if (!agentName.trim()) {
      setError('Please enter an agent name')
      return
    }

    if (validateAgentName(agentName)) {
      setStep('directory')
    }
  }

  const handleDirectoryNext = () => {
    setStep('creating')
    handleCreateAgent()
  }

  const handleCreateAgent = async () => {
    setCreating(true)
    setError(null)
    setAnimationPhase('preparing')
    setAnimationProgress(10)

    // Animate preparing phase
    const prepareInterval = setInterval(() => {
      setAnimationProgress(prev => Math.min(prev + 5, 30))
    }, 100)

    try {
      // Transition to creating phase
      setTimeout(() => {
        clearInterval(prepareInterval)
        setAnimationPhase('creating')
        setAnimationProgress(40)
      }, 800)

      const response = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          workingDirectory: workingDirectory || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create agent')
      }

      // Animate completion
      setAnimationProgress(80)
      await new Promise(resolve => setTimeout(resolve, 500))

      setAnimationPhase('ready')
      setAnimationProgress(100)

      // Short delay to show the celebration
      await new Promise(resolve => setTimeout(resolve, 1500))

      setStep('success')
    } catch (err) {
      clearInterval(prepareInterval)
      setAnimationPhase('error')
      setError(err instanceof Error ? err.message : 'Failed to create agent')
      // Return to directory step after showing error animation
      setTimeout(() => {
        setStep('directory')
      }, 2000)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-6">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="border-b border-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Logo */}
              <img
                src="/logo-constellation.svg"
                alt="AI Maestro Logo"
                className="w-12 h-12"
              />
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Create Your First AI Agent</h2>
                <p className="text-sm text-gray-400">
                  {step === 'name' && 'Step 1: Choose a name'}
                  {step === 'directory' && 'Step 2: Set working directory (optional)'}
                  {step === 'creating' && 'Creating your agent...'}
                  {step === 'success' && 'Success!'}
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-white transition-colors p-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'name' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Agent Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && agentName.trim()) {
                      handleNameNext()
                    }
                  }}
                  placeholder="project-category-name"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  autoFocus
                />
                <p className="mt-2 text-xs text-gray-400">
                  Use format: <code className="bg-gray-800 px-2 py-0.5 rounded">level1-level2-name</code>
                </p>
              </div>

              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <h3 className="text-sm font-medium text-blue-400 mb-2">Examples of good names:</h3>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li><code className="bg-gray-800 px-2 py-0.5 rounded">clients-acme-frontend</code></li>
                  <li><code className="bg-gray-800 px-2 py-0.5 rounded">personal-blog-writer</code></li>
                  <li><code className="bg-gray-800 px-2 py-0.5 rounded">apps-todo-backend</code></li>
                </ul>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-300">{error}</p>
                </div>
              )}
            </div>
          )}

          {step === 'directory' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Working Directory (optional)
                </label>
                <input
                  type="text"
                  value={workingDirectory}
                  onChange={(e) => setWorkingDirectory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleDirectoryNext()
                    }
                  }}
                  placeholder={process.env.HOME || '/home/user'}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  autoFocus
                />
                <p className="mt-2 text-xs text-gray-400">
                  Leave blank to use current directory. This is where the AI agent will work.
                </p>
              </div>

              <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
                <h3 className="text-sm font-medium text-white mb-2">Your agent will be created:</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-400" />
                    <span className="text-gray-300">
                      Name: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">{agentName}</code>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-400" />
                    <span className="text-gray-300">
                      Directory: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">
                        {workingDirectory || process.env.HOME || '~'}
                      </code>
                    </span>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}
            </div>
          )}

          {step === 'creating' && (
            <CreateAgentAnimation
              phase={animationPhase}
              agentName={agentName}
              progress={animationProgress}
            />
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-8">
              {/* Animated success header */}
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">🤖</div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  Welcome to the team, <span className="text-green-400">{agentName}</span>!
                </h3>
                <p className="text-gray-400">
                  Your new AI companion is ready to help you build amazing things
                </p>
              </div>

              <div className="w-full p-5 bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-xl">
                <h4 className="text-sm font-medium text-green-400 mb-4 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Quick Start Guide
                </h4>
                <ol className="space-y-3 text-sm text-gray-300">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">1</span>
                    <span>Find <code className="bg-gray-800 px-2 py-0.5 rounded text-blue-400">{agentName}</code> in the sidebar</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">2</span>
                    <span>Click to open the terminal</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">3</span>
                    <span>Run <code className="bg-gray-800 px-2 py-0.5 rounded">claude</code> or your favorite AI tool</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">4</span>
                    <span>Start building something awesome! 🚀</span>
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 p-6 flex items-center justify-between">
          {step === 'name' && (
            <>
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNameNext}
                disabled={!agentName.trim()}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
              >
                Next
              </button>
            </>
          )}

          {step === 'directory' && (
            <>
              <button
                onClick={() => setStep('name')}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleDirectoryNext}
                disabled={creating}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
              >
                Create Agent
              </button>
            </>
          )}

          {step === 'success' && (
            <button
              onClick={onComplete}
              className="ml-auto px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

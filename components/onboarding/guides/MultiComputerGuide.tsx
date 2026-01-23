'use client'

import { useState } from 'react'
import { ArrowLeft, Check, Server, Network, Shield, Play, Book } from 'lucide-react'

interface MultiComputerGuideProps {
  onBack: () => void
  onComplete: () => void
}

export default function MultiComputerGuide({ onBack, onComplete }: MultiComputerGuideProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    {
      title: 'Welcome to Multi-Computer Setup',
      icon: Server,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Perfect! You&apos;ll run AI Maestro across multiple computers using the Manager/Worker architecture.
          </p>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <h3 className="font-medium text-blue-400 mb-2">What you&apos;ll get:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>One Manager dashboard controlling all your computers</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Workers on laptop, desktop, cloud servers - all unified</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Resource distribution across machines</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Secure communication via Tailscale VPN</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Architecture Overview:</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <Server className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Manager (This Computer)</p>
                  <p className="text-gray-400">Runs the web dashboard, discovers workers, displays all sessions</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center flex-shrink-0">
                  <Server className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Workers (Remote Computers)</p>
                  <p className="text-gray-400">Run tmux sessions, expose API on port 23000, managed from Manager</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Setup Tailscale VPN',
      icon: Network,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Tailscale creates a secure VPN mesh network between your computers, making remote access safe and simple.
          </p>

          <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <h3 className="font-medium text-yellow-400 mb-2">Why Tailscale?</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <span>End-to-end encryption - your data stays private</span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <span>Works behind NAT/firewalls - no port forwarding needed</span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <span>Free for personal use (up to 20 devices)</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">Installation Steps:</h3>
            <ol className="space-y-3 text-sm text-gray-300 list-decimal list-inside">
              <li>
                Visit <a href="https://tailscale.com/download" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">tailscale.com/download</a>
              </li>
              <li>Install on <strong>all computers</strong> (Manager + Workers)</li>
              <li>Sign in with your account (same account on all devices)</li>
              <li>Verify connection: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">tailscale status</code></li>
            </ol>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-2">💡 Pro Tip:</p>
            <p className="text-sm text-gray-300">
              After setup, each computer gets a unique Tailscale IP (e.g., <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">100.x.x.x</code>).
              You&apos;ll use these IPs to connect your Manager to Workers.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Configure Workers',
      icon: Server,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Each Worker computer needs to run AI Maestro in Worker mode to expose sessions to the Manager.
          </p>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">On each Worker computer:</h3>
            <ol className="space-y-3 text-sm text-gray-300 list-decimal list-inside">
              <li>
                Clone AI Maestro: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">git clone [repo]</code>
              </li>
              <li>
                Install dependencies: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">yarn install</code>
              </li>
              <li>
                Build the project: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">yarn build</code>
              </li>
              <li>
                Create config file: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">.env.local</code>
                <div className="ml-6 mt-2 p-3 bg-gray-900 rounded font-mono text-xs">
                  DEPLOYMENT_TYPE=worker<br />
                  PORT=23000
                </div>
              </li>
              <li>
                Start worker: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">yarn start</code>
              </li>
              <li>
                Keep it running: Use <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">pm2</code> or <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">systemd</code> for persistence
              </li>
            </ol>
          </div>

          <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
            <h3 className="font-medium text-green-400 mb-2">Verify Worker is Running:</h3>
            <p className="text-sm text-gray-300 mb-2">
              From the Worker machine, check:
            </p>
            <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400">
              curl http://localhost:23000/api/sessions
            </code>
            <p className="text-xs text-gray-400 mt-2">
              Should return JSON list of tmux sessions
            </p>
          </div>

          <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-400 font-medium mb-1">⚠️ Important:</p>
            <p className="text-sm text-gray-300">
              Workers must run on port <code className="bg-gray-900 px-2 py-0.5 rounded">23000</code>.
              The Manager will connect to <code className="bg-gray-900 px-2 py-0.5 rounded">[tailscale-ip]:23000</code>
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Add Workers to Manager',
      icon: Play,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Now connect your Manager dashboard to the Workers using the host discovery wizard.
          </p>

          <div className="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg">
            <h3 className="font-medium text-white mb-3">Steps to Add a Worker:</h3>

            <div className="space-y-3">
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">1. Get Worker&apos;s Tailscale IP</h4>
                <p className="text-sm text-gray-300 mb-2">On the Worker machine, run:</p>
                <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400">
                  tailscale ip -4
                </code>
                <p className="text-xs text-gray-400 mt-1">Example: <code>100.64.0.2</code></p>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">2. Open Settings in Manager Dashboard</h4>
                <p className="text-sm text-gray-300">
                  Click <strong>Settings</strong> → <strong>Hosts</strong> tab
                </p>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">3. Add Worker Host</h4>
                <p className="text-sm text-gray-300 mb-2">
                  Enter the URL: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">http://100.64.0.2:23000</code>
                </p>
                <p className="text-xs text-gray-400">
                  The system will auto-discover sessions and verify connection
                </p>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">4. Repeat for Each Worker</h4>
                <p className="text-sm text-gray-300">
                  Add all your Worker machines to manage them from one dashboard
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">What happens next:</h3>
            <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside">
              <li>Worker sessions appear in sidebar with host badge</li>
              <li>Click any session to open terminal (works across all hosts)</li>
              <li>Create sessions on any Worker from the dashboard</li>
              <li>Full terminal streaming and interaction</li>
            </ol>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-2">📚 Need More Help?</p>
            <p className="text-sm text-gray-300">
              Read the full setup tutorial in{' '}
              <a
                href="https://github.com/23blocks-OS/ai-maestro/blob/main/docs/SETUP-TUTORIAL.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                SETUP-TUTORIAL.md
              </a>
              {' '}for detailed instructions, troubleshooting, and advanced configurations.
            </p>
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
              <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                <Server className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Multi-Computer Setup</h1>
                <p className="text-sm text-gray-400">Manager/Worker architecture across your machines</p>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 w-12 rounded-full transition-colors ${
                    index <= currentStep ? 'bg-green-500' : 'bg-gray-700'
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
              <StepIcon className="w-6 h-6 text-green-400" />
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
                    href="https://github.com/23blocks-OS/ai-maestro/blob/main/docs/SETUP-TUTORIAL.md"
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
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
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

'use client'

import { useState } from 'react'
import { ArrowLeft, Check, Server, Network, Shield, Play, Book, RefreshCw } from 'lucide-react'

interface MultiComputerGuideProps {
  onBack: () => void
  onComplete: () => void
}

export default function MultiComputerGuide({ onBack, onComplete }: MultiComputerGuideProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    {
      title: 'Welcome to Multi-Computer Setup',
      icon: Network,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Connect your AI Maestro instances into a peer mesh network - share agents seamlessly across all your computers.
          </p>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <h3 className="font-medium text-blue-400 mb-2">What you&apos;ll get:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>View and manage agents from any connected computer</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Laptop, desktop, cloud servers - all interconnected as peers</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Automatic peer discovery - add once, both sides sync</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Secure communication via Tailscale VPN</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Mesh Network Architecture:</h3>
            <div className="space-y-3 text-sm">
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center justify-center gap-4 text-xs text-gray-400 mb-3">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center mb-1">
                      <Server className="w-5 h-5 text-blue-400" />
                    </div>
                    <span>MacBook</span>
                  </div>
                  <div className="flex-1 border-t border-dashed border-gray-600 relative">
                    <RefreshCw className="w-3 h-3 text-green-400 absolute -top-1.5 left-1/2 -translate-x-1/2 bg-gray-900" />
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-lg bg-green-500/20 border border-green-500/40 flex items-center justify-center mb-1">
                      <Server className="w-5 h-5 text-green-400" />
                    </div>
                    <span>Mac Mini</span>
                  </div>
                  <div className="flex-1 border-t border-dashed border-gray-600 relative">
                    <RefreshCw className="w-3 h-3 text-green-400 absolute -top-1.5 left-1/2 -translate-x-1/2 bg-gray-900" />
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center mb-1">
                      <Server className="w-5 h-5 text-purple-400" />
                    </div>
                    <span>Cloud</span>
                  </div>
                </div>
                <p className="text-center text-gray-400 text-xs">
                  Every node is equal - no central server required
                </p>
              </div>
              <p className="text-gray-400">
                Each computer runs AI Maestro and can see agents on all connected peers.
                Add a host once, and both sides automatically discover each other.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Setup Tailscale VPN',
      icon: Shield,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Tailscale creates a secure VPN mesh network between your computers, making peer connections safe and simple.
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
                <span>Free for personal use (up to 100 devices)</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">Installation Steps:</h3>
            <ol className="space-y-3 text-sm text-gray-300 list-decimal list-inside">
              <li>
                Visit <a href="https://tailscale.com/download" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">tailscale.com/download</a>
              </li>
              <li>Install on <strong>all computers</strong> you want to connect</li>
              <li>Sign in with your account (same account on all devices)</li>
              <li>Verify connection: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">tailscale status</code></li>
            </ol>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-2">Pro Tip:</p>
            <p className="text-sm text-gray-300">
              After setup, each computer gets a unique Tailscale IP (e.g., <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">100.x.x.x</code>).
              You&apos;ll use these IPs to connect your AI Maestro instances.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Install AI Maestro on Each Computer',
      icon: Server,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Each computer in your mesh needs its own AI Maestro instance. The setup is identical on every machine.
          </p>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">On each computer:</h3>
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
                Start AI Maestro: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">yarn start</code>
              </li>
              <li>
                Keep it running: Use <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">pm2</code> or <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">systemd</code> for persistence
              </li>
            </ol>
          </div>

          <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
            <h3 className="font-medium text-green-400 mb-2">Verify It&apos;s Running:</h3>
            <p className="text-sm text-gray-300 mb-2">
              On each machine, check:
            </p>
            <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400">
              curl http://localhost:23000/api/sessions
            </code>
            <p className="text-xs text-gray-400 mt-2">
              Should return JSON list of tmux sessions on that machine
            </p>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-1">Same setup everywhere:</p>
            <p className="text-sm text-gray-300">
              Unlike traditional setups, there&apos;s no &quot;server&quot; vs &quot;client&quot; distinction.
              Every AI Maestro instance is a full peer that can connect to any other.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Connect Your Peers',
      icon: Play,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Add a peer from any computer - both sides will automatically discover each other.
          </p>

          <div className="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg">
            <h3 className="font-medium text-white mb-3">Connect Two Computers:</h3>

            <div className="space-y-3">
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">1. Get the Peer&apos;s Tailscale IP</h4>
                <p className="text-sm text-gray-300 mb-2">On the remote computer, run:</p>
                <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400">
                  tailscale ip -4
                </code>
                <p className="text-xs text-gray-400 mt-1">Example: <code>100.64.0.2</code></p>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">2. Open Settings → Hosts</h4>
                <p className="text-sm text-gray-300">
                  From any AI Maestro dashboard, click <strong>Settings</strong> → <strong>Hosts</strong> tab
                </p>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">3. Add the Peer</h4>
                <p className="text-sm text-gray-300 mb-2">
                  Enter the URL: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">http://100.64.0.2:23000</code>
                </p>
                <p className="text-xs text-gray-400">
                  AI Maestro will verify the connection and exchange peer info
                </p>
              </div>

              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <h4 className="text-sm font-medium text-green-400 mb-2">4. Automatic Sync!</h4>
                <p className="text-sm text-gray-300">
                  Both computers now see each other. Add a third peer from any node -
                  it automatically propagates to all connected peers.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">What happens:</h3>
            <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside">
              <li>Agents from all peers appear in your sidebar with host badges</li>
              <li>Click any agent to open its terminal (works across all peers)</li>
              <li>Create agents on any connected peer from your dashboard</li>
              <li>The mesh grows automatically as peers share their connections</li>
            </ol>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-2">Need More Help?</p>
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
                <Network className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Multi-Computer Setup</h1>
                <p className="text-sm text-gray-400">Connect your machines into a peer mesh network</p>
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

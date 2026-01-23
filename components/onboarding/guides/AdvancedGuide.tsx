'use client'

import { useState } from 'react'
import { ArrowLeft, Check, Zap, Terminal, Server, Package, Cloud, Network, Book, RefreshCw } from 'lucide-react'

interface AdvancedGuideProps {
  onBack: () => void
  onComplete: () => void
}

export default function AdvancedGuide({ onBack, onComplete }: AdvancedGuideProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    {
      title: 'Welcome to Advanced Setup',
      icon: Zap,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            You&apos;ve chosen the most powerful setup! This combines all AI Maestro features in a peer mesh network for maximum flexibility and scale.
          </p>

          <div className="p-4 bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-lg">
            <h3 className="font-medium text-red-400 mb-2">What you&apos;ll build:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <Terminal className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <span><strong>Local Sessions:</strong> Direct tmux sessions on this computer</span>
              </li>
              <li className="flex items-start gap-2">
                <Server className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span><strong>Remote Peers:</strong> AI Maestro instances on other machines</span>
              </li>
              <li className="flex items-start gap-2">
                <Package className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <span><strong>Local Docker:</strong> Containerized agents on this machine</span>
              </li>
              <li className="flex items-start gap-2">
                <Cloud className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                <span><strong>Cloud Docker:</strong> Containers on AWS/GCP/Azure</span>
              </li>
              <li className="flex items-start gap-2">
                <Network className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                <span><strong>Mesh Network:</strong> All nodes connected as equals - no central server</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <h3 className="font-medium text-yellow-400 mb-2">Complexity Warning:</h3>
            <p className="text-sm text-gray-300">
              This setup requires knowledge of: tmux, Docker, networking, cloud infrastructure, and Tailscale VPN.
              Estimated setup time: <strong>30+ minutes</strong>. Consider starting with a simpler setup if you&apos;re new to these technologies.
            </p>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Prerequisites:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <span>tmux installed and basic knowledge</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <span>Docker Desktop installed</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <span>Access to remote machines or cloud accounts</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <span>Tailscale account (free)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <span>Comfortable with command line and networking</span>
              </li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: 'Setup Foundation',
      icon: Network,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Start by setting up the core infrastructure that all features will build upon.
          </p>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">Step 1: Install Tailscale VPN</h3>
            <p className="text-sm text-gray-300 mb-2">
              Tailscale creates a secure mesh network for all your machines:
            </p>
            <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside ml-3">
              <li>Visit <a href="https://tailscale.com/download" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">tailscale.com/download</a></li>
              <li>Install on <strong>all machines</strong> (local, remote, cloud VMs)</li>
              <li>Sign in with same account everywhere</li>
              <li>Verify: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">tailscale status</code></li>
            </ol>
          </div>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">Step 2: Install Docker Everywhere</h3>
            <p className="text-sm text-gray-300 mb-2">On this machine:</p>
            <ul className="space-y-1 text-sm text-gray-300 ml-3">
              <li>• Docker Desktop: <a href="https://docker.com/products/docker-desktop" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">download here</a></li>
            </ul>
            <p className="text-sm text-gray-300 mb-2 mt-3">On remote Linux machines:</p>
            <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400">
              curl -fsSL https://get.docker.com | sh
            </code>
          </div>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">Step 3: Start AI Maestro (This Machine)</h3>
            <p className="text-sm text-gray-300 mb-2">
              Launch AI Maestro - it runs the same way on every machine:
            </p>
            <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400">
              yarn dev  # or yarn start for production
            </code>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-2">Foundation Complete:</p>
            <p className="text-sm text-gray-300">
              With Tailscale, Docker, and AI Maestro running, you have the base infrastructure. Next steps add peers and capabilities.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Connect Remote Peers',
      icon: Server,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Set up AI Maestro on remote machines and connect them into your mesh network.
          </p>

          <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
            <h3 className="font-medium text-green-400 mb-2">On each remote machine:</h3>
            <ol className="space-y-3 text-sm text-gray-300 list-decimal list-inside">
              <li>
                Clone AI Maestro:
                <code className="block bg-gray-900 px-3 py-2 rounded text-blue-400 mt-1">
                  git clone [repo-url] && cd ai-maestro
                </code>
              </li>
              <li>
                Install and build:
                <code className="block bg-gray-900 px-3 py-2 rounded text-blue-400 mt-1">
                  yarn install && yarn build
                </code>
              </li>
              <li>
                Start AI Maestro:
                <code className="block bg-gray-900 px-3 py-2 rounded text-blue-400 mt-1">
                  yarn start  # or use pm2/systemd for persistence
                </code>
              </li>
            </ol>
          </div>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">Connect Peers:</h3>
            <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside">
              <li>Get peer&apos;s Tailscale IP: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">tailscale ip -4</code></li>
              <li>From any AI Maestro: Settings → Hosts</li>
              <li>Add: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">http://[tailscale-ip]:23000</code></li>
            </ol>
            <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                <RefreshCw className="w-4 h-4" />
                <span>Automatic bidirectional sync!</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Add from any node - both sides discover each other. New peers propagate to all connected nodes.
              </p>
            </div>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-2">Peers Connected:</p>
            <p className="text-sm text-gray-300">
              Remote agents now appear in your sidebar with host badges. You can view and manage agents on any peer from any dashboard.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Add Docker Capabilities',
      icon: Package,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Deploy containerized agents both locally and on remote peers for maximum flexibility.
          </p>

          <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-lg">
            <h3 className="font-medium text-purple-400 mb-2">Local Docker Agents:</h3>
            <p className="text-sm text-gray-300 mb-2">Create a Dockerfile for your agent:</p>
            <pre className="text-xs text-gray-300 bg-gray-900 p-3 rounded overflow-x-auto">
{`FROM python:3.11-slim
RUN apt-get update && apt-get install -y tmux git curl
RUN curl -fsSL https://claude.ai/install.sh | sh
WORKDIR /workspace
CMD ["tmux", "new-session", "-s", "docker-agent", "-d", "claude"]`}
            </pre>
            <p className="text-sm text-gray-300 mt-2">Build and run:</p>
            <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400">
              docker build -t my-agent . && docker run -d --name agent1 my-agent
            </code>
          </div>

          <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-lg">
            <h3 className="font-medium text-orange-400 mb-2">Cloud Docker Agents:</h3>
            <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside">
              <li>Install AI Maestro on cloud VM (AWS/GCP/Azure/etc.)</li>
              <li>Install Docker on that VM</li>
              <li>Run same Docker containers as local</li>
              <li>Connect as peer - agents appear across all dashboards</li>
            </ol>
          </div>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Hybrid Strategy:</h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-start gap-2">
                <Terminal className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <span><strong>Quick tasks:</strong> Local tmux sessions (instant, no overhead)</span>
              </div>
              <div className="flex items-start gap-2">
                <Package className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <span><strong>Isolated work:</strong> Local Docker (environment separation)</span>
              </div>
              <div className="flex items-start gap-2">
                <Server className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span><strong>Heavy computation:</strong> Remote peers (offload from laptop)</span>
              </div>
              <div className="flex items-start gap-2">
                <Cloud className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                <span><strong>Scalable workloads:</strong> Cloud Docker (spin up/down as needed)</span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Best Practices & Next Steps',
      icon: Book,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            You now have the most powerful AI Maestro setup. Here&apos;s how to make the most of it.
          </p>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <h3 className="font-medium text-blue-400 mb-3">Organization Tips:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Use consistent naming: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">project-env-agent</code></span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Group by project/client in first level: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">client-acme-*</code></span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Use session notes to document what each agent is doing</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Add host labels to identify peers (Settings → Hosts)</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <h3 className="font-medium text-yellow-400 mb-3">Cost Optimization:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">$</span>
                <span>Monitor cloud costs - set billing alerts</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">$</span>
                <span>Shut down idle cloud containers</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">$</span>
                <span>Use spot/preemptible instances for non-critical work</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">$</span>
                <span>Prefer local/remote peers over cloud when possible</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
            <h3 className="font-medium text-green-400 mb-3">Security Best Practices:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Never expose AI Maestro ports publicly - use Tailscale</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Keep Tailscale running on all machines</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Use environment variables for sensitive config</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Regularly update AI Maestro and dependencies</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">Essential Reading:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>
                <a href="https://github.com/23blocks-OS/ai-maestro/blob/main/docs/SETUP-TUTORIAL.md" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  Complete Setup Tutorial
                </a> - Step-by-step multi-computer setup
              </li>
              <li>
                <a href="https://github.com/23blocks-OS/ai-maestro/blob/main/docs/CONCEPTS.md" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  Architecture Concepts
                </a> - Understanding hosts, peers, and the mesh network
              </li>
              <li>
                <a href="https://github.com/23blocks-OS/ai-maestro/blob/main/docs/USE-CASES.md" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  Use Cases & Examples
                </a> - Real-world scenarios and workflows
              </li>
              <li>
                <a href="https://tailscale.com/kb" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  Tailscale Knowledge Base
                </a> - VPN setup and troubleshooting
              </li>
              <li>
                <a href="https://docs.docker.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  Docker Documentation
                </a> - Container best practices
              </li>
            </ul>
          </div>

          <div className="p-6 bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-green-500/30 rounded-lg">
            <h3 className="font-medium text-white mb-2 text-lg">You&apos;re Ready!</h3>
            <p className="text-sm text-gray-300">
              You have the most powerful AI development environment possible - a fully connected peer mesh network. Start creating agents and explore all the features AI Maestro offers!
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
              <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <Zap className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Advanced Setup</h1>
                <p className="text-sm text-gray-400">Full peer mesh with all features</p>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 w-12 rounded-full transition-colors ${
                    index <= currentStep ? 'bg-red-500' : 'bg-gray-700'
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
              <StepIcon className="w-6 h-6 text-red-400" />
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
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
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

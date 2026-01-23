'use client'

import { useState } from 'react'
import { ArrowLeft, Check, Cloud, Package, Server, Play, Book, DollarSign, Network } from 'lucide-react'

interface DockerHybridGuideProps {
  onBack: () => void
  onComplete: () => void
}

export default function DockerHybridGuide({ onBack, onComplete }: DockerHybridGuideProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    {
      title: 'Welcome to Docker Hybrid Setup',
      icon: Cloud,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Run AI agents in Docker containers both locally and on cloud infrastructure, all interconnected in a peer mesh network.
          </p>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <h3 className="font-medium text-blue-400 mb-2">Why Hybrid Docker?</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Cost optimization - run heavy workloads in cloud, light ones locally</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Scalability - spin up cloud containers when needed</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Environment consistency - same containers locally and in cloud</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Platform testing - test on different environments easily</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Architecture Overview:</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Local Docker (This Computer)</p>
                  <p className="text-gray-400">Development, testing, lightweight agents</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                  <Cloud className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Cloud Docker (AWS/GCP/Azure)</p>
                  <p className="text-gray-400">Production, heavy computation, scalable workloads</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center flex-shrink-0">
                  <Network className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Peer Mesh Network</p>
                  <p className="text-gray-400">All instances connected - view everything from any dashboard</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-400 font-medium mb-1">Cost Consideration:</p>
            <p className="text-sm text-gray-300">
              Cloud resources cost money. Start small, monitor usage, and scale as needed. Most cloud providers offer free tiers for testing.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Setup Local Docker',
      icon: Package,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            First, set up Docker on your local machine for development and testing.
          </p>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">Quick Setup:</h3>
            <ol className="space-y-3 text-sm text-gray-300 list-decimal list-inside">
              <li>
                Install Docker Desktop:{' '}
                <a
                  href="https://www.docker.com/products/docker-desktop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  docker.com/products/docker-desktop
                </a>
              </li>
              <li>Launch and verify: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">docker --version</code></li>
              <li>
                Test with hello-world: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">docker run hello-world</code>
              </li>
            </ol>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <h3 className="font-medium text-blue-400 mb-2">Create a local agent:</h3>
            <p className="text-sm text-gray-300 mb-2">Quick example to test local Docker:</p>
            <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400 whitespace-pre-wrap">
              docker run -d --name local-agent \\{'\n'}
              {'  '}-v $(pwd):/workspace \\{'\n'}
              {'  '}my-agent-image
            </code>
            <p className="text-xs text-gray-400 mt-2">
              This creates a local containerized agent visible in AI Maestro
            </p>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Local Docker is great for:</h3>
            <ul className="space-y-1 text-sm text-gray-300">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <span>Quick prototyping and testing</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <span>Offline development</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <span>Small, lightweight agents</span>
              </li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: 'Setup Cloud Docker',
      icon: Cloud,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Deploy Docker containers to cloud infrastructure for scalable, production-ready agents.
          </p>

          <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-lg">
            <h3 className="font-medium text-purple-400 mb-2">Choose Your Cloud Provider:</h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="p-3 bg-gray-900/50 rounded">
                <p className="font-medium text-white">AWS (Amazon Web Services)</p>
                <p className="text-gray-400 text-xs">ECS, Fargate, or EC2 with Docker</p>
              </div>
              <div className="p-3 bg-gray-900/50 rounded">
                <p className="font-medium text-white">GCP (Google Cloud Platform)</p>
                <p className="text-gray-400 text-xs">Cloud Run, GKE, or Compute Engine</p>
              </div>
              <div className="p-3 bg-gray-900/50 rounded">
                <p className="font-medium text-white">Azure</p>
                <p className="text-gray-400 text-xs">Container Instances, AKS, or VMs</p>
              </div>
              <div className="p-3 bg-gray-900/50 rounded">
                <p className="font-medium text-white">DigitalOcean / Linode / Others</p>
                <p className="text-gray-400 text-xs">Droplets with Docker installed</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">General Cloud Setup Steps:</h3>
            <ol className="space-y-3 text-sm text-gray-300 list-decimal list-inside">
              <li>Create a cloud VM/instance (Ubuntu 22.04+ recommended)</li>
              <li>Install Docker: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">curl -fsSL https://get.docker.com | sh</code></li>
              <li>Install tmux: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">apt-get install tmux</code></li>
              <li>Install AI Maestro (same steps as any other computer)</li>
              <li>Run Docker containers on that machine</li>
              <li>Connect peers via Tailscale</li>
            </ol>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-2">Pro Tip:</p>
            <p className="text-sm text-gray-300">
              Use Tailscale to securely connect all your AI Maestro instances. This avoids exposing ports publicly and provides encrypted peer-to-peer connections.
            </p>
          </div>

          <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-400 font-medium mb-1">Cost Tips:</p>
            <ul className="space-y-1 text-xs text-gray-300">
              <li>• Start with small instances (1-2 vCPU, 2-4GB RAM)</li>
              <li>• Use spot/preemptible instances for non-critical workloads</li>
              <li>• Set up billing alerts to avoid surprises</li>
              <li>• Shut down instances when not in use</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: 'Connect Everything',
      icon: Play,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Bring it all together: local containers, cloud containers, all connected in one peer mesh network.
          </p>

          <div className="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg">
            <h3 className="font-medium text-white mb-3">Setup Workflow:</h3>

            <div className="space-y-3">
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">1. Setup Tailscale VPN</h4>
                <p className="text-sm text-gray-300">
                  Install Tailscale on all machines (local and cloud). This creates a secure mesh network.
                </p>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">2. Install AI Maestro on Cloud VMs</h4>
                <p className="text-sm text-gray-300 mb-2">
                  On each cloud VM, install and start AI Maestro:
                </p>
                <code className="block bg-gray-900 px-3 py-2 rounded text-xs text-blue-400">
                  yarn install && yarn build && yarn start
                </code>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">3. Connect Peers</h4>
                <p className="text-sm text-gray-300 mb-2">
                  From any AI Maestro instance, go to Settings → Hosts and add peers:
                </p>
                <code className="block bg-gray-900 px-3 py-2 rounded text-xs text-blue-400">
                  http://[tailscale-ip]:23000
                </code>
                <p className="text-xs text-gray-400 mt-1">
                  Add once from any node - both sides auto-discover each other
                </p>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">4. Deploy Docker Containers</h4>
                <p className="text-sm text-gray-300">
                  Run containers on any connected peer. All agents appear in every dashboard with host badges.
                </p>
              </div>

              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <h4 className="text-sm font-medium text-green-400 mb-2">5. Manage from Anywhere</h4>
                <p className="text-sm text-gray-300">
                  Open any AI Maestro dashboard to see all agents across all peers. No central server needed.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Hybrid Benefits in Action:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <DollarSign className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Save money: Light agents run locally (free), heavy ones in cloud (pay-per-use)</span>
              </li>
              <li className="flex items-start gap-2">
                <Server className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <span>Scale: Spin up cloud containers for big jobs, shut down when done</span>
              </li>
              <li className="flex items-start gap-2">
                <Package className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <span>Consistency: Same Dockerfile works locally and in cloud</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-2">Further Reading:</p>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>
                • <a href="https://github.com/23blocks-OS/ai-maestro/blob/main/docs/SETUP-TUTORIAL.md" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Multi-Computer Setup Guide</a>
              </li>
              <li>
                • <a href="https://docs.docker.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Docker Documentation</a>
              </li>
              <li>
                • <a href="https://tailscale.com/kb" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Tailscale Knowledge Base</a>
              </li>
            </ul>
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
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
                <Cloud className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Docker Hybrid Setup</h1>
                <p className="text-sm text-gray-400">Local + cloud containerized agents in a peer mesh</p>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 w-12 rounded-full transition-colors ${
                    index <= currentStep ? 'bg-orange-500' : 'bg-gray-700'
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
              <StepIcon className="w-6 h-6 text-orange-400" />
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
                  className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors text-sm font-medium"
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

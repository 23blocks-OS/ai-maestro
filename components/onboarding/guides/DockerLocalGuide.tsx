'use client'

import { useState } from 'react'
import { ArrowLeft, Check, Package, Container, Layers, Play, Book } from 'lucide-react'

interface DockerLocalGuideProps {
  onBack: () => void
  onComplete: () => void
}

export default function DockerLocalGuide({ onBack, onComplete }: DockerLocalGuideProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    {
      title: 'Welcome to Docker Local Setup',
      icon: Package,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Perfect! You&apos;ll run AI agents in Docker containers on this computer for isolation and consistent environments.
          </p>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <h3 className="font-medium text-blue-400 mb-2">Why Docker for AI agents?</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Complete environment isolation - no dependency conflicts</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Reproducible builds - same environment every time</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Easy cleanup - remove container, remove everything</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Version management - different Python/Node versions per agent</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Prerequisites Check:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gray-500/20 border border-gray-500/30 flex items-center justify-center">
                  <span className="text-xs text-gray-400">?</span>
                </div>
                <span>Docker Desktop installed and running</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gray-500/20 border border-gray-500/30 flex items-center justify-center">
                  <span className="text-xs text-gray-400">?</span>
                </div>
                <span>Basic Docker knowledge (docker run, docker ps)</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                  <Check className="w-3 h-3 text-green-400" />
                </div>
                <span>AI Maestro is running (you&apos;re seeing this!)</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-400 font-medium mb-1">📝 Note:</p>
            <p className="text-sm text-gray-300">
              This setup runs Docker containers locally on this computer only. For hybrid cloud + local setup, choose the Docker Hybrid option instead.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Install Docker Desktop',
      icon: Container,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Docker Desktop provides everything you need to run containers on macOS, Windows, or Linux.
          </p>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">Installation Steps:</h3>
            <ol className="space-y-3 text-sm text-gray-300 list-decimal list-inside">
              <li>
                Visit{' '}
                <a
                  href="https://www.docker.com/products/docker-desktop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  docker.com/products/docker-desktop
                </a>
              </li>
              <li>Download for your operating system (macOS/Windows/Linux)</li>
              <li>Install and launch Docker Desktop</li>
              <li>Wait for Docker engine to start (whale icon in menu bar)</li>
              <li>
                Verify installation:
                <code className="block bg-gray-900 px-3 py-2 rounded text-blue-400 mt-2">
                  docker --version
                </code>
              </li>
            </ol>
          </div>

          <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
            <h3 className="font-medium text-green-400 mb-2">Quick Test:</h3>
            <p className="text-sm text-gray-300 mb-2">
              Run a test container to verify Docker is working:
            </p>
            <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400">
              docker run hello-world
            </code>
            <p className="text-xs text-gray-400 mt-2">
              Should download and run successfully, printing &quot;Hello from Docker!&quot;
            </p>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-2">💡 Pro Tip:</p>
            <p className="text-sm text-gray-300">
              Allocate enough resources to Docker (Settings → Resources): At least 4GB RAM and 2 CPUs for AI coding agents.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Understanding Docker Agents',
      icon: Layers,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            AI Maestro can manage AI agents running inside Docker containers just like native tmux sessions.
          </p>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-3">How it works:</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-400 font-bold">1</span>
                </div>
                <div>
                  <p className="font-medium text-white">Create a Dockerfile</p>
                  <p className="text-gray-400">
                    Define your agent&apos;s environment (Python version, dependencies, Claude Code CLI, etc.)
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-400 font-bold">2</span>
                </div>
                <div>
                  <p className="font-medium text-white">Build the image</p>
                  <p className="text-gray-400">
                    <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">docker build -t my-agent .</code>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-400 font-bold">3</span>
                </div>
                <div>
                  <p className="font-medium text-white">Run with tmux inside</p>
                  <p className="text-gray-400">
                    Container starts tmux session, AI Maestro discovers it automatically
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-400 font-bold">4</span>
                </div>
                <div>
                  <p className="font-medium text-white">Manage from dashboard</p>
                  <p className="text-gray-400">
                    View, interact, and control containerized agents like any other session
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Example Dockerfile:</h3>
            <pre className="text-xs text-gray-300 overflow-x-auto">
{`FROM python:3.11-slim

# Install tmux and dependencies
RUN apt-get update && apt-get install -y \\
    tmux git curl && \\
    rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | sh

# Set working directory
WORKDIR /workspace

# Start tmux session on container start
CMD ["tmux", "new-session", "-s", "docker-agent", "-d", "claude"]`}
            </pre>
          </div>

          <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-400 font-medium mb-1">⚠️ Important:</p>
            <p className="text-sm text-gray-300">
              Containers must have tmux installed and running. AI Maestro discovers tmux sessions, so containerized agents need tmux inside.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Create Your First Docker Agent',
      icon: Play,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-gray-300">
            Let&apos;s create a simple Docker-based AI agent and connect it to AI Maestro.
          </p>

          <div className="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg">
            <h3 className="font-medium text-white mb-3">Quick Start Guide:</h3>

            <div className="space-y-3">
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">1. Create project directory</h4>
                <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400">
                  mkdir my-docker-agent && cd my-docker-agent
                </code>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">2. Create Dockerfile</h4>
                <p className="text-sm text-gray-300 mb-2">
                  Use the example from the previous step, or customize for your needs
                </p>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">3. Build the image</h4>
                <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400">
                  docker build -t my-agent .
                </code>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">4. Run the container</h4>
                <code className="block bg-gray-900 px-3 py-2 rounded text-sm text-blue-400 whitespace-pre-wrap">
                  docker run -d --name agent1 \\{'\n'}
                  {'  '}-v $(pwd):/workspace \\{'\n'}
                  {'  '}my-agent
                </code>
              </div>

              <div className="p-3 bg-gray-900/50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 mb-2">5. Check AI Maestro</h4>
                <p className="text-sm text-gray-300">
                  The Docker container&apos;s tmux session should appear in your sidebar (may take a few seconds)
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
            <h3 className="font-medium text-white mb-2">Managing Docker agents:</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>View logs: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">docker logs agent1</code></span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Stop container: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">docker stop agent1</code></span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Remove container: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">docker rm agent1</code></span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Execute commands: <code className="bg-gray-900 px-2 py-0.5 rounded text-blue-400">docker exec -it agent1 bash</code></span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400 font-medium mb-2">📚 Want to learn more?</p>
            <p className="text-sm text-gray-300">
              Check out Docker&apos;s official documentation and AI Maestro&apos;s advanced guides for more complex setups.
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
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                <Package className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Docker Local Setup</h1>
                <p className="text-sm text-gray-400">Run containerized AI agents on this machine</p>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 w-12 rounded-full transition-colors ${
                    index <= currentStep ? 'bg-purple-500' : 'bg-gray-700'
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
              <StepIcon className="w-6 h-6 text-purple-400" />
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
                    href="https://docs.docker.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                  >
                    <Book className="w-4 h-4" />
                    Docker Documentation
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
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
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

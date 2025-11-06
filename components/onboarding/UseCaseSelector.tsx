'use client'

import { Terminal, Server, Package, Cloud, Zap, X } from 'lucide-react'
import type { UseCase } from './OnboardingFlow'

interface UseCaseSelectorProps {
  onSelect: (useCase: UseCase) => void
  onSkip: () => void
}

export default function UseCaseSelector({ onSelect, onSkip }: UseCaseSelectorProps) {
  const useCases = [
    {
      id: 'single-computer' as UseCase,
      icon: Terminal,
      title: 'Single Computer',
      subtitle: 'Multiple AI agents on one machine',
      description: 'Run all your AI coding agents (Claude Code, Aider, etc.) on this computer with organized sessions',
      difficulty: 'Beginner',
      difficultyColor: 'text-green-400',
      time: '5 minutes',
      ideal: ['Solo developers', 'Getting started', 'Simple workflows'],
    },
    {
      id: 'multi-computer' as UseCase,
      icon: Server,
      title: 'Multiple Computers',
      subtitle: 'Manager/Worker architecture',
      description: 'Control AI agents across your laptop, desktop, and cloud servers from one dashboard',
      difficulty: 'Intermediate',
      difficultyColor: 'text-yellow-400',
      time: '15 minutes',
      ideal: ['Resource distribution', 'Remote work', 'Team collaboration'],
    },
    {
      id: 'docker-local' as UseCase,
      icon: Package,
      title: 'Docker Agents (Local)',
      subtitle: 'Containerized AI agents on this machine',
      description: 'Run AI agents in Docker containers for isolation and consistent environments',
      difficulty: 'Intermediate',
      difficultyColor: 'text-yellow-400',
      time: '10 minutes',
      ideal: ['Environment isolation', 'Dependency management', 'Reproducible builds'],
    },
    {
      id: 'docker-hybrid' as UseCase,
      icon: Cloud,
      title: 'Docker Hybrid',
      subtitle: 'Local + cloud containerized agents',
      description: 'Some agents in local Docker containers, others on cloud infrastructure',
      difficulty: 'Advanced',
      difficultyColor: 'text-orange-400',
      time: '20 minutes',
      ideal: ['Scalable workloads', 'Platform testing', 'Cost optimization'],
    },
    {
      id: 'advanced' as UseCase,
      icon: Zap,
      title: 'Advanced Setup',
      subtitle: 'All features combined',
      description: 'Mix of local sessions, remote workers, Docker containers, and cloud deployments',
      difficulty: 'Expert',
      difficultyColor: 'text-red-400',
      time: '30+ minutes',
      ideal: ['Large teams', 'Complex workflows', 'Maximum flexibility'],
    },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-6">
              {/* Logo */}
              <div className="flex-shrink-0">
                <img
                  src="/logo-constellation.svg"
                  alt="AI Maestro Logo"
                  className="w-20 h-20"
                />
              </div>

              {/* Welcome Text */}
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Welcome to AI Maestro! 👋</h1>
                <p className="text-lg text-gray-300">
                  Let&apos;s set up your AI coding workspace in just a few minutes
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Choose the setup that best matches your needs. You can always change this later.
                </p>
              </div>
            </div>
            <button
              onClick={onSkip}
              className="text-gray-400 hover:text-gray-300 transition-colors p-2"
              title="Skip onboarding"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Use Cases Grid */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <h2 className="text-xl font-semibold text-white mb-6">Choose Your Setup</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {useCases.map((useCase) => {
              const Icon = useCase.icon

              return (
                <button
                  key={useCase.id}
                  onClick={() => onSelect(useCase.id)}
                  className="group relative p-6 bg-gray-800/30 border-2 border-gray-700 rounded-xl hover:border-blue-500 hover:bg-gray-800/50 transition-all duration-200 text-left"
                >
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                    <Icon className="w-6 h-6 text-blue-400" />
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
                    {useCase.title}
                  </h3>
                  <p className="text-sm text-gray-400 mb-3">{useCase.subtitle}</p>

                  {/* Description */}
                  <p className="text-sm text-gray-300 mb-4 line-clamp-3">{useCase.description}</p>

                  {/* Metadata */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Difficulty:</span>
                      <span className={`font-medium ${useCase.difficultyColor}`}>
                        {useCase.difficulty}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Setup time:</span>
                      <span className="font-medium text-gray-300">{useCase.time}</span>
                    </div>
                  </div>

                  {/* Ideal For */}
                  <div className="border-t border-gray-700 pt-3">
                    <p className="text-xs text-gray-500 mb-2">Ideal for:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {useCase.ideal.map((tag, index) => (
                        <span
                          key={index}
                          className="text-xs px-2 py-1 bg-gray-700/50 text-gray-300 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Hover Arrow */}
                  <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Help Text */}
          <div className="mt-8 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-gray-300">
              <strong className="text-blue-400">Not sure which to choose?</strong> Start with{' '}
              <button
                onClick={() => onSelect('single-computer')}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Single Computer
              </button>{' '}
              - it&apos;s the easiest way to get started. You can always expand to multiple computers or Docker later.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
